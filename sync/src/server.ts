import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { verifyBoardToken } from "./auth.ts";
import type { SyncConfig } from "./config.ts";
import type { DocumentStore } from "./documentStore.ts";
import { createGuardedStore, type BoardExists } from "./guardedStore.ts";
import { createMcpEndpoint, type McpDeps } from "./mcp.ts";
import type { MembershipChecker } from "./membership.ts";

/** WebSocket close code used when a board is at its concurrent-connection cap. */
export const BOARD_FULL_CODE = 4429;
/** WebSocket close code sent when a board's snapshot exceeds the document limit. */
export const BOARD_TOO_LARGE_CODE = 4413;
/** Extra payload room for the sync protocol framing above the document limit. */
export const MAX_PAYLOAD_HEADROOM_BYTES = 64 * 1024;
/**
 * WebSocket close code for revoke (AC-13) and kick (AC-14). The client maps
 * 4403 to "revoked" and deletes its local copy. Sent on the raw socket — the
 * Hocuspocus `connection.close(code)` path only forwards a reason string, so the
 * provider would reconstruct the close code as 1000 (n7 → n9 handoff).
 */
export const REVOKED_CODE = 4403;

/**
 * Both the WebSocket frame cap and the persisted-document limit derive from the
 * single configured document size. The frame cap adds protocol headroom so an
 * over-limit update still reaches the store, which then tells the client.
 */
export function documentLimits(maxDocumentBytes: number): {
  storeBytes: number;
  frameBytes: number;
} {
  return {
    storeBytes: maxDocumentBytes,
    frameBytes: maxDocumentBytes + MAX_PAYLOAD_HEADROOM_BYTES,
  };
}

export interface SyncServerDeps {
  /** Runtime config (defaults live only in `config.ts`). */
  config: SyncConfig;
  store: DocumentStore;
  isMember: MembershipChecker;
  boardExists: BoardExists;
  /** Remote MCP endpoint (RM-4). Omit to leave the route unserved. */
  mcp?: McpDeps;
}

export interface SyncServer {
  server: Server;
  /** Binds the WebSocket server and resolves with the actual port. */
  listen(): Promise<number>;
  /**
   * Revoke: deletes the board snapshot row (AC-13) and drops every connection.
   * Also covers late updates from connections that are still closing, because
   * the store re-checks that the board row exists.
   */
  revokeBoard(boardId: string): Promise<number>;
  /** Drop one member's connections only (AC-14); the snapshot stays. */
  kickMember(boardId: string, userId: string): Promise<number>;
  destroy(): Promise<void>;
}

export function createSyncServer(deps: SyncServerDeps): SyncServer {
  const { config } = deps;
  let draining = false;
  let destroyed: Promise<void> | undefined;
  // Keep failed snapshots even after Hocuspocus unloads a document. Its database
  // hook absorbs asynchronous errors, so unload alone is not persistence proof.
  const dirty = new Map<string, Uint8Array>();
  const requests = new Set<Promise<unknown>>();
  const limits = documentLimits(config.maxDocumentBytes);
  const guardedStore = createGuardedStore(deps.store, {
    maxBytes: limits.storeBytes,
    boardExists: deps.boardExists,
  });
  const mcpEndpoint =
    deps.mcp === undefined
      ? undefined
      : createMcpEndpoint({ maxDocumentBytes: config.maxDocumentBytes, ...deps.mcp });

  const server = new Server(
    {
      port: config.port,
      quiet: true,
      stopOnSignals: false,
      debounce: config.debounceMs,
      maxDebounce: config.maxDebounceMs,
      // Hocuspocus 3.4.4 persists on unload either way, so keeping documents
      // resident buys no cache hit and only accumulates memory. Store then
      // unload; a reconnect re-fetches from Postgres.
      unloadImmediately: true,
      async onUpgrade({ socket }) {
        if (draining) {
          socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
          return Promise.reject();
        }
      },
      async onConnect() {
        if (draining) throw new Error("sync is shutting down");
      },
      async onRequest({ instance, request, response }) {
        if (draining) {
          response.writeHead(503, { Connection: "close" });
          response.end();
          return Promise.reject();
        }
        // A rejection without an error tells Hocuspocus the response is already sent.
        if (mcpEndpoint !== undefined) {
          const handling = mcpEndpoint.handle(instance, request, response);
          requests.add(handling);
          try {
            if (await handling) return Promise.reject();
          } finally {
            requests.delete(handling);
          }
        }
      },
      async onAuthenticate({ token, documentName }) {
        const claims = await verifyBoardToken(token, config.jwtSecret);
        if (claims.boardId !== documentName) {
          throw new Error("board token does not match the document");
        }
        if (!(await deps.isMember(claims.boardId, claims.userId))) {
          throw new Error("not a member of this board");
        }
        if (draining) throw new Error("sync is shutting down");
        return { userId: claims.userId, boardId: claims.boardId };
      },
      async connected({ instance, documentName, connection }) {
        const document = instance.documents.get(documentName);
        if (document !== undefined && document.getConnectionsCount() > config.maxConnectionsPerBoard) {
          // Close the raw socket so the 4429 code reaches the client; the
          // Hocuspocus `Connection.close()` path only forwards a reason string.
          connection.webSocket.close(BOARD_FULL_CODE, "board full");
        }
      },
      // The loaded state is what the store holds, so closing a board nobody changed writes nothing.
      async afterLoadDocument({ documentName, document }) {
        guardedStore.remember(documentName, Y.encodeStateAsUpdate(document));
      },
      async onChange({ documentName, document }) {
        dirty.set(documentName, Y.encodeStateAsUpdate(document));
      },
      async afterUnloadDocument({ documentName }) {
        guardedStore.forget(documentName);
      },
      extensions: [
        new Database({
          fetch: ({ documentName }) => guardedStore.fetch(documentName),
          // The debounce hook cannot reject safely. Retain a failed state for
          // an explicit, awaited retry at shutdown instead of claiming success.
          store: async ({ documentName, state }) => {
            try {
              await persist(documentName, state);
            } catch (error) {
              console.warn(
                `snapshot store failed for board ${documentName}:`,
                error instanceof Error ? error.message : error,
              );
            }
          },
        }),
      ],
    },
    // Frame cap = document limit + headroom for protocol framing (spec §7).
    { maxPayload: limits.frameBytes },
  );

  async function persist(name: string, state: Uint8Array): Promise<void> {
    dirty.set(name, state);
    const outcome = await guardedStore.store(name, state);
    if (!outcome.stored && outcome.reason === "too_large") {
      closeWithCode(name, BOARD_TOO_LARGE_CODE, "board too large");
    }
    if (!outcome.stored && outcome.reason === "check_failed") {
      throw new Error(`snapshot not persisted: ${outcome.reason}`);
    }
    // A revoked board intentionally has no persisted document. An unchanged
    // snapshot is already durable. Don't erase a newer change arriving mid-store.
    if (dirty.get(name) === state) dirty.delete(name);
  }

  /** Closes a board's document connections with a raw socket close code. */
  function closeWithCode(boardId: string, code: number, reason: string): number {
    const document = server.hocuspocus.documents.get(boardId);
    if (document === undefined) return 0;

    let closed = 0;
    for (const connection of document.getConnections()) {
      connection.webSocket.close(code, reason);
      closed += 1;
    }
    return closed;
  }

  function closeConnections(boardId: string, userId?: string): number {
    const document = server.hocuspocus.documents.get(boardId);
    if (document === undefined) return 0;

    let closed = 0;
    for (const connection of document.getConnections()) {
      const context = (connection.context ?? {}) as { userId?: string };
      if (userId === undefined || context.userId === userId) {
        // Raw socket close so the 4403 code reaches the client (the Hocuspocus
        // connection.close path collapses it to 1000).
        connection.webSocket.close(REVOKED_CODE, "revoked");
        closed += 1;
      }
    }
    return closed;
  }

  return {
    server,
    listen: async () => {
      await server.listen();
      return server.address.port;
    },
    revokeBoard: async (boardId) => {
      // Close live connections first: their pending stores are serialized with
      // the delete by the board lock, and any store landing after the delete is
      // dropped by the board-exists re-check.
      let closed = 0;
      try {
        closed = closeConnections(boardId);
        await guardedStore.delete(boardId);
        dirty.delete(boardId);
      } catch (error) {
        // The snapshot delete is best-effort; never leave clients connected.
        if (closed === 0) closed = closeConnections(boardId);
        throw error;
      }
      return closed;
    },
    kickMember: async (boardId, userId) => {
      const normalized = userId.trim();
      if (normalized === "") return 0;
      return closeConnections(boardId, normalized);
    },
    destroy: () => {
      if (destroyed !== undefined) return destroyed;
      draining = true;
      destroyed = (async () => {
        // Finish already accepted MCP requests, then freeze WebSocket input.
        await Promise.allSettled([...requests]);
        for (const socket of server.webSocketServer.clients) socket.terminate();
        await server.destroy();
        // destroy waits for Hocuspocus debounce/unload work. Explicit retries
        // prove durability even if a previous hook swallowed a store failure.
        const results = await Promise.allSettled([...dirty].map(([name, state]) => persist(name, state)));
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length > 0 || dirty.size > 0) {
          throw new Error(`shutdown persistence failed for ${failures.length || dirty.size} document(s)`);
        }
      })();
      return destroyed;
    },
  };
}
