import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { MemoryDocumentStore } from "../src/documentStore.ts";
import {
  BOARD_FULL_CODE,
  BOARD_TOO_LARGE_CODE,
  REVOKED_CODE,
  createSyncServer,
  documentLimits,
  type SyncServer,
} from "../src/server.ts";
import { makeConfig, signBoardToken, waitFor } from "./helpers.ts";

const BOARD = `b-${crypto.randomUUID().slice(0, 8)}`;
const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();
const OTHER_BOARD = crypto.randomUUID();

interface ProviderHandle {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  websocket: HocuspocusProviderWebsocket;
}

function makeWebsocket(url: string): HocuspocusProviderWebsocket {
  return new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
}

function connect(
  url: string,
  token: string,
  name = BOARD,
  onClose?: (code: number) => void,
): ProviderHandle {
  const doc = new Y.Doc();
  const websocket = makeWebsocket(url);
  const options = { name, token, document: doc, websocketProvider: websocket };
  // Omit onClose entirely when unused — passing `undefined` clobbers the
  // provider's internal default and throws when a close actually arrives.
  const provider = new HocuspocusProvider(
    onClose ? { ...options, onClose: ({ event }) => onClose(event.code) } : options,
  );
  // Passing an external websocketProvider leaves manageSocket=false, so the
  // provider does not attach itself; attach() wires up the open/message events.
  provider.attach();
  return { doc, provider, websocket };
}

describe("sync server", () => {
  let store: MemoryDocumentStore;
  let sync: SyncServer;
  let url: string;
  let members: Set<string>;
  let aliveBoards: Set<string>;
  const open: ProviderHandle[] = [];

  beforeEach(async () => {
    store = new MemoryDocumentStore();
    members = new Set([
      `${BOARD}:${USER_A}`,
      `${BOARD}:${USER_B}`,
      `${OTHER_BOARD}:${USER_A}`,
    ]);
    aliveBoards = new Set([BOARD, OTHER_BOARD]);
    sync = createSyncServer({
      config: makeConfig({ maxDocumentBytes: 10 * 1024 * 1024 }),
      store,
      isMember: async (boardId, userId) => members.has(`${boardId}:${userId}`),
      boardExists: async (boardId) => aliveBoards.has(boardId),
    });
    const port = await sync.listen();
    url = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const handle of open.splice(0)) {
      handle.provider.destroy();
      handle.websocket.destroy();
    }
    await sync.destroy();
  });

  async function connected(
    userId: string,
    board = BOARD,
    onClose?: (code: number) => void,
  ): Promise<ProviderHandle> {
    const token = await signBoardToken({ userId, boardId: board });
    const handle = connect(url, token, board, onClose);
    open.push(handle);
    return handle;
  }

  test("two clients with valid board tokens converge on the same value", async () => {
    const a = await connected(USER_A);
    const b = await connected(USER_B);
    await waitFor(() => a.provider.isSynced && b.provider.isSynced, { label: "both clients synced" });

    a.doc.getMap("meta").set("name", "board-from-a");
    await waitFor(() => b.doc.getMap("meta").get("name") === "board-from-a", {
      label: "b sees a's write",
    });

    b.doc.getMap("notes").set("n1", "from-b");
    await waitFor(() => a.doc.getMap("notes").get("n1") === "from-b", {
      label: "a sees b's write",
    });

    await waitFor(
      () =>
        Y.encodeStateVector(a.doc).every(
          (byte, index) => byte === Y.encodeStateVector(b.doc)[index],
        ),
      { label: "state vectors converge" },
    );
  });

  test("rejects a connection with an invalid board token", async () => {
    let failed = false;
    const doc = new Y.Doc();
    const websocket = makeWebsocket(url);
    const provider = new HocuspocusProvider({
      name: BOARD,
      token: "not-a-valid-jwt",
      document: doc,
      websocketProvider: websocket,
      onAuthenticationFailed: () => {
        failed = true;
      },
    });
    provider.attach();
    open.push({ doc, provider, websocket });

    await waitFor(() => failed, { label: "authentication failure" });
    expect(provider.isSynced).toBe(false);
    expect(sync.server.hocuspocus.getConnectionsCount()).toBe(0);
  });

  test("rejects a token issued for a different board", async () => {
    let failed = false;
    const token = await signBoardToken({ userId: USER_A, boardId: OTHER_BOARD });
    const doc = new Y.Doc();
    const websocket = makeWebsocket(url);
    const provider = new HocuspocusProvider({
      name: BOARD,
      token,
      document: doc,
      websocketProvider: websocket,
      onAuthenticationFailed: () => {
        failed = true;
      },
    });
    provider.attach();
    open.push({ doc, provider, websocket });

    await waitFor(() => failed, { label: "board mismatch rejection" });
    expect(provider.isSynced).toBe(false);
  });

  test("revoke deletes the snapshot and drops every connection with 4403", async () => {
    let codeA: number | undefined;
    let codeB: number | undefined;
    const a = await connected(USER_A, BOARD, (c) => (codeA = c));
    const b = await connected(USER_B, BOARD, (c) => (codeB = c));
    await waitFor(() => a.provider.isSynced && b.provider.isSynced, { label: "both clients synced" });
    expect(sync.server.hocuspocus.getConnectionsCount()).toBe(2);

    a.doc.getMap("meta").set("name", "persisted");
    await waitFor(() => store.has(BOARD), { label: "snapshot persisted" });

    // n4 deletes the board row first (cascade removes members), then fires the hook.
    members.delete(`${BOARD}:${USER_A}`);
    members.delete(`${BOARD}:${USER_B}`);
    aliveBoards.delete(BOARD);
    const closed = await sync.revokeBoard(BOARD);

    expect(closed).toBe(2);
    expect(store.has(BOARD)).toBe(false);
    await waitFor(() => sync.server.hocuspocus.getConnectionsCount() === 0, {
      label: "connections dropped",
    });
    // n9: the client must see 4403, not a collapsed 1000 — else it never cleans up.
    await waitFor(() => codeA === REVOKED_CODE && codeB === REVOKED_CODE, {
      label: `clients see ${REVOKED_CODE}`,
    });
  });

  test("revoke still drops connections when deleting the snapshot throws", async () => {
    const failing = createSyncServer({
      config: makeConfig(),
      store: {
        fetch: (name) => store.fetch(name),
        store: (name, state) => store.store(name, state),
        delete: async () => {
          throw new Error("postgres delete failed");
        },
      },
      isMember: async (boardId, userId) => members.has(`${boardId}:${userId}`),
      boardExists: async (boardId) => aliveBoards.has(boardId),
    });
    const port = await failing.listen();
    const failingUrl = `ws://127.0.0.1:${port}`;
    try {
      const a = connect(failingUrl, await signBoardToken({ userId: USER_A, boardId: BOARD }), BOARD);
      open.push(a);
      await waitFor(() => a.provider.isSynced, { label: "client synced" });
      expect(failing.server.hocuspocus.getConnectionsCount()).toBe(1);

      await expect(failing.revokeBoard(BOARD)).rejects.toThrow("postgres delete failed");
      await waitFor(() => failing.server.hocuspocus.getConnectionsCount() === 0, {
        label: "connections closed despite delete failure",
      });
    } finally {
      await failing.destroy();
    }
  });

  test("kicking one member closes only that member's connections with 4403 (AC-14)", async () => {
    let codeA: number | undefined;
    let codeB: number | undefined;
    const a = await connected(USER_A, BOARD, (c) => (codeA = c));
    const b = await connected(USER_B, BOARD, (c) => (codeB = c));
    await waitFor(() => a.provider.isSynced && b.provider.isSynced, { label: "both clients synced" });

    members.delete(`${BOARD}:${USER_B}`);
    const closed = await sync.kickMember(BOARD, USER_B);

    expect(closed).toBe(1);
    // USER_A's connection survives the kick.
    await waitFor(() => sync.server.hocuspocus.getConnectionsCount() === 1, {
      label: "one connection remains",
    });
    await waitFor(() => codeB === REVOKED_CODE, { label: `kicked client sees ${REVOKED_CODE}` });
    expect(codeA).toBeUndefined();
  });

  test("an over-limit write closes that board's connections with 4413", async () => {
    const small = createSyncServer({
      config: makeConfig({ maxDocumentBytes: 1024 }),
      store,
      isMember: async (boardId, userId) => members.has(`${boardId}:${userId}`),
      boardExists: async (boardId) => aliveBoards.has(boardId),
    });
    const port = await small.listen();
    const smallUrl = `ws://127.0.0.1:${port}`;
    try {
      let closeCode: number | undefined;
      const doc = new Y.Doc();
      const websocket = makeWebsocket(smallUrl);
      const a = new HocuspocusProvider({
        name: BOARD,
        token: await signBoardToken({ userId: USER_A, boardId: BOARD }),
        document: doc,
        websocketProvider: websocket,
        onClose: ({ event }) => {
          closeCode = event.code;
        },
      });
      a.attach();
      open.push({ doc, provider: a, websocket });

      const b = connect(smallUrl, await signBoardToken({ userId: USER_A, boardId: OTHER_BOARD }), OTHER_BOARD);
      open.push(b);
      await waitFor(() => a.isSynced && b.provider.isSynced, { label: "both clients synced" });

      // Oversized update: the frame cap (limit + headroom) admits it, the guarded
      // store drops it, and the client is told via close code 4413.
      doc.getMap("meta").set("blob", "x".repeat(8192));
      await waitFor(() => closeCode !== undefined, { label: "4413 board too large" });
      expect(closeCode).toBe(BOARD_TOO_LARGE_CODE);

      b.doc.getMap("note").set("still", "alive");
      await waitFor(() => b.doc.getMap("note").get("still") === "alive", { label: "other board still live" });
    } finally {
      // `open` is drained by afterEach; only tear down this extra listener here.
      await small.destroy();
    }
  });

  test("rejects connections over the per-board cap with close code 4429", async () => {
    const capped = createSyncServer({
      config: makeConfig({ maxConnectionsPerBoard: 1 }),
      store,
      isMember: async (boardId, userId) => members.has(`${boardId}:${userId}`),
      boardExists: async (boardId) => aliveBoards.has(boardId),
    });
    const port = await capped.listen();
    const cappedUrl = `ws://127.0.0.1:${port}`;
    try {
      const a = connect(cappedUrl, await signBoardToken({ userId: USER_A, boardId: BOARD }), BOARD);
      open.push(a);
      await waitFor(() => a.provider.isSynced, { label: "first client synced" });

      let closeCode: number | undefined;
      const doc = new Y.Doc();
      const websocket = makeWebsocket(cappedUrl);
      const third = new HocuspocusProvider({
        name: BOARD,
        token: await signBoardToken({ userId: USER_B, boardId: BOARD }),
        document: doc,
        websocketProvider: websocket,
        onClose: ({ event }) => {
          closeCode = event.code;
        },
      });
      third.attach();
      open.push({ doc, provider: third, websocket });

      await waitFor(() => closeCode !== undefined, { label: "third connection rejected" });
      expect(closeCode).toBe(BOARD_FULL_CODE);
    } finally {
      await capped.destroy();
    }
  });

  test("uses config-derived websocket and unload settings", () => {
    const limits = documentLimits(10 * 1024 * 1024);
    // Default true: keeping documents resident only accumulates memory.
    expect(sync.server.configuration.unloadImmediately).toBe(true);
    expect(sync.server.webSocketServer.options.maxPayload).toBe(limits.frameBytes);
  });
});
