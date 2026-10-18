import type { IncomingMessage, ServerResponse } from "node:http";
import type { Hocuspocus } from "@hocuspocus/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as Y from "yjs";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { isBoardId, isUuid } from "./auth.ts";
import { McpLimiter, McpRateLimitError, Semaphore, SnapshotBudget, type McpLimits } from "./mcpLimits.ts";
import type { MembershipChecker } from "./membership.ts";

/** Streamable HTTP MCP endpoint that lives inside the sync process (RM-4). */

export interface McpEndpointConfig {
  /** Base URL of the Ktor server (internal address), used for token introspection. */
  ktorUrl: string;
  /** Public MCP address. Its path is the route and the token audience must equal it (D7). */
  resourceUrl: string;
  /** Public base URL; the 401 challenge points at its protected-resource metadata. */
  publicBaseUrl: string;
}

/** Live access token as reported by Ktor `POST /oauth/introspect`. */
export interface McpTokenInfo {
  userId: string;
  clientId: string | null;
  grantId: string | null;
  /** Audience the token was issued for. */
  resource: string | null;
}

/** Resolves a bearer token. `null` means invalid, expired or revoked; throws when Ktor is unreachable. */
export type McpIntrospector = (token: string) => Promise<McpTokenInfo | null>;

/** Open direct connection to a board's live document. */
export type BoardConnection = Awaited<ReturnType<Hocuspocus["openDirectConnection"]>>;

/** Failure that is safe to show the agent as a tool error. */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

/** One board the caller can reach, as listed from the database. */
export interface McpBoardInfo {
  id: string;
  name: string;
  /** Parent board id for a board nested inside a shared board, otherwise null. */
  parentId: string | null;
  /** Caller's role on the shared root this board belongs to. */
  role: string;
}

/** Database-backed lookups the read tools need. */
export interface McpBoardSource {
  /**
   * Boards the user is a member of, including boards nested inside them, by name.
   * At most one more than `MAX_LISTED_BOARDS`, so callers can tell the list was cut.
   */
  listBoards(userId: string): Promise<McpBoardInfo[]>;
  /** Saved snapshot of a board document, or null when none was stored yet. */
  fetchSnapshot(boardId: string): Promise<Uint8Array | null>;
  /** Server file id to original file name for one board's attachments. */
  fileNames(boardId: string): Promise<Map<string, string>>;
}

/** A file the agent sends for a board, already decoded from base64. */
export interface McpUploadFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

/** File the Ktor server stored. */
export interface McpUploadedFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

/** Stores a file on the Ktor server as the given board member. Throws [McpToolError] for refusals the agent can act on. */
export type McpFileUploader = (userId: string, boardId: string, file: McpUploadFile) => Promise<McpUploadedFile>;

/** Thrown when one search has read as many snapshot bytes as its budget allows. */
export class McpBudgetExceeded extends McpToolError {
  constructor() {
    super("snapshot read budget reached");
    this.name = "McpBudgetExceeded";
  }
}

/** What a read tool may use. It has no way to open a board for writing. */
export interface McpReadContext {
  userId: string;
  clientId: string | null;
  grantId: string | null;
  /** Boards the caller is a member of right now (see `McpBoardSource.listBoards` for the cap). */
  listBoards(): Promise<McpBoardInfo[]>;
  /**
   * Read-only view of a board after a membership check. A document that is already
   * open is returned from memory; otherwise the saved snapshot is decoded into a
   * throwaway Y.Doc. No Hocuspocus connection is opened, so nothing is written back.
   * Callers must not modify the returned document.
   */
  readDoc(board: string | McpBoardInfo, budget?: SnapshotBudget): Promise<Y.Doc>;
  /** Snapshot bytes one search may read. */
  maxSearchSnapshotBytes: number;
  /**
   * Server file id to original file name for the board's attachments.
   * Like `readDoc`, a board object from `listBoards()` skips the membership check that call already made.
   */
  fileNames(board: string | McpBoardInfo): Promise<Map<string, string>>;
}

/** What a write tool may use: the read view plus the ways to change a board. */
export interface McpWriteContext extends McpReadContext {
  /** Changes one write call may apply; the rest is left unapplied. */
  maxChanges: number;
  /** Board document size limit. A change that would not fit is refused up front, because the store drops such a snapshot silently. */
  maxDocumentBytes: number;
  /**
   * Checks the caller's board membership right now, then opens the board through
   * Hocuspocus so edits reach connected browsers and the normal store path.
   * The connection is closed when `fn` settles. Only write tools use this.
   */
  withBoard<T>(boardId: string, fn: (connection: BoardConnection) => Promise<T> | T): Promise<T>;
  /** Checks membership, then stores the file on the Ktor server as the caller. */
  uploadFile(boardId: string, file: McpUploadFile): Promise<McpUploadedFile>;
}

export interface McpTool {
  name: string;
  description: string;
  /** Zod shape of the tool arguments, as `registerTool` takes it. */
  inputSchema: ZodRawShape;
  /** True for tools that never change a board. */
  readOnly?: boolean;
  /** Returns the text shown to the agent. Throw [McpToolError] for expected failures. */
  call(args: Record<string, unknown>, context: McpWriteContext): Promise<string>;
}

/** Defines a tool that may change boards. Keeps the argument types of `call` tied to `inputSchema`. */
export function defineTool<Shape extends ZodRawShape>(tool: {
  name: string;
  description: string;
  inputSchema: Shape;
  call(args: z.objectOutputType<Shape, ZodTypeAny>, context: McpWriteContext): Promise<string>;
}): McpTool {
  return tool as unknown as McpTool;
}

/** Defines a read-only tool. Its context type has no `withBoard`, so it cannot open a board for writing. */
export function defineReadTool<Shape extends ZodRawShape>(tool: {
  name: string;
  description: string;
  inputSchema: Shape;
  call(args: z.objectOutputType<Shape, ZodTypeAny>, context: McpReadContext): Promise<string>;
}): McpTool {
  return { ...tool, readOnly: true } as unknown as McpTool;
}

export interface McpDeps {
  config: McpEndpointConfig;
  introspect: McpIntrospector;
  isMember: MembershipChecker;
  /** Database lookups for the read tools. */
  boards: McpBoardSource;
  /** Stores attachments on the Ktor server. Without it, `upload_attachment` reports that uploads are unavailable. */
  uploadFile?: McpFileUploader;
  /** Request caps; omitted fields use `DEFAULT_MCP_LIMITS`. */
  limits?: Partial<McpLimits>;
  /** Board document size limit, set from the sync config. Omitted means no up-front size check. */
  maxDocumentBytes?: number;
  /** Tools served by `tools/list` and `tools/call`. */
  tools?: readonly McpTool[];
}

export const MAX_MCP_BODY_BYTES = 1024 * 1024;
const INTROSPECT_TIMEOUT_MS = 5000;

const trimSlashes = (value: string): string => value.replace(/\/+$/, "");

/** Route path, taken from the public resource URL so the route and the token audience agree. */
export function mcpPath(config: McpEndpointConfig): string {
  return trimSlashes(new URL(config.resourceUrl).pathname) || "/";
}

/** Calls Ktor with the shared internal secret on every request, so revoking a grant takes effect at once. */
export function createKtorIntrospector(
  config: Pick<McpEndpointConfig, "ktorUrl">,
  internalSecret: string,
  fetchImpl: typeof fetch = fetch,
): McpIntrospector {
  const url = new URL("/oauth/introspect", config.ktorUrl);
  return async (token) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "x-moss-internal": internalSecret,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(INTROSPECT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`introspection failed with HTTP ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    if (body.active !== true || typeof body.sub !== "string" || !isUuid(body.sub)) return null;
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    return {
      userId: body.sub,
      clientId: text(body.client_id),
      grantId: text(body.grant_id),
      resource: text(body.aud),
    };
  };
}

function bearerToken(request: IncomingMessage): string | null {
  const match = /^Bearer +(\S+)$/i.exec(request.headers.authorization ?? "");
  return match?.[1] ?? null;
}

function send(response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
  if (body === undefined) {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > MAX_MCP_BODY_BYTES) return null;
  // Event-based on purpose: leaving a `for await` early destroys the request, and the 413
  // reply then never reaches the client. Past the limit we stop buffering and let the
  // `connection: close` reply drop the rest.
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    request.on("data", (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > MAX_MCP_BODY_BYTES) {
        over = true;
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => resolve(null));
  });
}

export interface McpEndpoint {
  /** Serves the request when its path is the MCP route; returns false for every other path. */
  handle(instance: Hocuspocus, request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export function createMcpEndpoint(deps: McpDeps): McpEndpoint {
  const route = mcpPath(deps.config);
  const tools = deps.tools ?? [];
  const limiter = new McpLimiter(deps.limits);
  const snapshotSlots = new Semaphore(limiter.limits.maxConcurrentSnapshotReads);
  const metadataUrl = new URL("/.well-known/oauth-protected-resource", deps.config.publicBaseUrl).toString();

  const challenge = (error?: string) =>
    "Bearer " + (error ? `error="${error}", ` : "") + `resource_metadata="${metadataUrl}"`;

  async function requireMember(boardId: string, userId: string): Promise<void> {
    // One message for both cases so a caller cannot probe which board ids exist.
    if (!isBoardId(boardId) || !(await deps.isMember(boardId, userId))) {
      throw new McpToolError("board not found or not accessible");
    }
  }

  async function loadDoc(instance: Hocuspocus, boardId: string, budget?: SnapshotBudget): Promise<Y.Doc> {
    const live = instance.documents.get(boardId);
    if (live !== undefined) return live;
    // The fetch and the decode both sit inside a slot, so only a few snapshots are in memory at once.
    return snapshotSlots.run(async () => {
      const doc = new Y.Doc();
      const snapshot = await deps.boards.fetchSnapshot(boardId);
      if (snapshot !== null) {
        if (budget !== undefined) {
          if (budget.used + snapshot.byteLength > budget.limitBytes) throw new McpBudgetExceeded();
          budget.used += snapshot.byteLength;
        }
        Y.applyUpdate(doc, snapshot);
      }
      return doc;
    });
  }

  function contextFor(instance: Hocuspocus, info: McpTokenInfo): McpWriteContext {
    // Boards this caller's own listBoards() returned: membership was just proven for them.
    const listed = new WeakSet<McpBoardInfo>();
    const boardIdFor = async (board: string | McpBoardInfo): Promise<string> => {
      if (typeof board !== "string") {
        if (!listed.has(board)) throw new Error("a board object must come from listBoards()");
        return board.id;
      }
      await requireMember(board, info.userId);
      return board;
    };
    return {
      userId: info.userId,
      clientId: info.clientId,
      grantId: info.grantId,
      maxChanges: limiter.limits.maxChangesPerRequest,
      maxSearchSnapshotBytes: limiter.limits.maxSearchSnapshotBytes,
      maxDocumentBytes: deps.maxDocumentBytes ?? Number.MAX_SAFE_INTEGER,
      async listBoards() {
        const boards = await deps.boards.listBoards(info.userId);
        for (const board of boards) listed.add(board);
        return boards;
      },
      async readDoc(board, budget) {
        return loadDoc(instance, await boardIdFor(board), budget);
      },
      async fileNames(board) {
        return deps.boards.fileNames(await boardIdFor(board));
      },
      async withBoard(boardId, fn) {
        await requireMember(boardId, info.userId);
        const connection = await instance.openDirectConnection(boardId, {
          userId: info.userId,
          boardId,
          via: "mcp",
        });
        try {
          return await fn(connection);
        } finally {
          await connection.disconnect();
        }
      },
      async uploadFile(boardId, file) {
        await requireMember(boardId, info.userId);
        if (deps.uploadFile === undefined) throw new McpToolError("file upload is not available on this server");
        return deps.uploadFile(info.userId, boardId, file);
      },
    };
  }

  /** A fresh server per request: the endpoint keeps no sessions, and the tools close over this caller. */
  function serverFor(instance: Hocuspocus, info: McpTokenInfo): McpServer {
    const server = new McpServer({ name: "moss", version: "0.1.0" });
    const context = contextFor(instance, info);
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool.readOnly === true ? { annotations: { readOnlyHint: true } } : {}),
        },
        async (args: Record<string, unknown>) => {
          try {
            limiter.consume(info.userId, tool.readOnly !== true);
            return { content: [{ type: "text" as const, text: await tool.call(args, context) }] };
          } catch (error) {
            const expected = error instanceof McpToolError || error instanceof McpRateLimitError;
            if (!expected) {
              console.warn(`mcp tool ${tool.name} failed:`, error instanceof Error ? error.message : error);
            }
            const message = expected ? error.message : "tool failed";
            return { isError: true, content: [{ type: "text" as const, text: message }] };
          }
        },
      );
    }
    return server;
  }

  return {
    async handle(instance, request, response) {
      const path = trimSlashes(new URL(request.url ?? "/", "http://sync").pathname) || "/";
      if (path !== route) return false;

      if (request.method !== "POST") {
        // No server-initiated stream and no sessions to end.
        send(response, 405, undefined, { allow: "POST" });
        return true;
      }

      const token = bearerToken(request);
      if (token === null) {
        send(response, 401, undefined, { "www-authenticate": challenge() });
        return true;
      }
      let info: McpTokenInfo | null;
      try {
        info = await deps.introspect(token);
      } catch (error) {
        // Not a verdict on the token, so a 401 would push the user into re-approval for nothing.
        console.warn("mcp introspection failed:", error instanceof Error ? error.message : error);
        send(response, 503, { error: "token check unavailable" }, { "retry-after": "5" });
        return true;
      }
      if (info === null) {
        send(response, 401, undefined, { "www-authenticate": challenge("invalid_token") });
        return true;
      }
      if (info.resource === null || trimSlashes(info.resource) !== trimSlashes(deps.config.resourceUrl)) {
        // A live token for another resource, which differs from a revoked token in the logs.
        console.warn("mcp audience mismatch", info.resource, deps.config.resourceUrl);
        send(response, 401, undefined, { "www-authenticate": challenge("invalid_token") });
        return true;
      }
      // One user's overlapping requests (a search loop, a retry storm) must not starve sync for everyone.
      const release = limiter.enter(info.userId);
      if (release === null) {
        send(response, 429, { error: "too many concurrent requests" }, { "retry-after": "1" });
        return true;
      }
      response.once("close", release);

      const raw = await readBody(request);
      if (raw === null) {
        send(response, 413, { error: "request body too large" }, { connection: "close" });
        return true;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        send(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return true;
      }
      if (Array.isArray(payload)) {
        // JSON-RPC batches were dropped from the 2025-06-18 spec, and each entry could be a tool call.
        send(response, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Batch requests are not supported" },
        });
        return true;
      }

      const server = serverFor(instance, info);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(request, response, payload);
      } catch (error) {
        console.warn("mcp request failed:", error instanceof Error ? error.message : error);
        if (!response.headersSent) {
          send(response, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } });
        }
      }
      return true;
    },
  };
}
