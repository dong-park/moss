import type { IncomingMessage, ServerResponse } from "node:http";
import type { Hocuspocus } from "@hocuspocus/server";
import { isBoardId, isUuid } from "./auth.ts";
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

export interface McpToolContext {
  userId: string;
  clientId: string | null;
  grantId: string | null;
  /**
   * Checks the caller's board membership right now, then opens the board through
   * Hocuspocus so edits reach connected browsers and the normal store path.
   * The connection is closed when `fn` settles.
   */
  withBoard<T>(boardId: string, fn: (connection: BoardConnection) => Promise<T> | T): Promise<T>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Returns the text shown to the agent. Throw [McpToolError] for expected failures. */
  call(args: Record<string, unknown>, context: McpToolContext): Promise<string>;
}

export interface McpDeps {
  config: McpEndpointConfig;
  introspect: McpIntrospector;
  isMember: MembershipChecker;
  /** Tools served by `tools/list` and `tools/call`; empty until n5/n6 add theirs. */
  tools?: readonly McpTool[];
}

export const MCP_SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
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

type RpcOutcome = { result: unknown } | { error: { code: number; message: string } };

const rpcError = (code: number, message: string): RpcOutcome => ({ error: { code, message } });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface McpEndpoint {
  /** Serves the request when its path is the MCP route; returns false for every other path. */
  handle(instance: Hocuspocus, request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export function createMcpEndpoint(deps: McpDeps): McpEndpoint {
  const route = mcpPath(deps.config);
  const tools = deps.tools ?? [];
  const metadataUrl = new URL("/.well-known/oauth-protected-resource", deps.config.publicBaseUrl).toString();

  const challenge = (error?: string) =>
    "Bearer " + (error ? `error="${error}", ` : "") + `resource_metadata="${metadataUrl}"`;

  function contextFor(instance: Hocuspocus, info: McpTokenInfo): McpToolContext {
    return {
      userId: info.userId,
      clientId: info.clientId,
      grantId: info.grantId,
      async withBoard(boardId, fn) {
        // One message for both cases so a caller cannot probe which board ids exist.
        if (!isBoardId(boardId) || !(await deps.isMember(boardId, info.userId))) {
          throw new McpToolError("board not found or not accessible");
        }
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
    };
  }

  async function dispatch(
    instance: Hocuspocus,
    info: McpTokenInfo,
    method: string,
    params: Record<string, unknown>,
  ): Promise<RpcOutcome> {
    switch (method) {
      case "initialize": {
        const version = MCP_SUPPORTED_VERSIONS.find((v) => v === params.protocolVersion) ?? MCP_SUPPORTED_VERSIONS[0];
        return {
          result: {
            protocolVersion: version,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "moss", version: "0.1.0" },
          },
        };
      }
      case "ping":
        return { result: {} };
      case "tools/list":
        return {
          result: {
            tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
          },
        };
      case "tools/call": {
        const tool = tools.find((candidate) => candidate.name === params.name);
        if (tool === undefined) return rpcError(-32602, `Unknown tool: ${String(params.name)}`);
        const args = isRecord(params.arguments) ? params.arguments : {};
        try {
          const text = await tool.call(args, contextFor(instance, info));
          return { result: { content: [{ type: "text", text }] } };
        } catch (error) {
          if (!(error instanceof McpToolError)) {
            console.warn(`mcp tool ${tool.name} failed:`, error instanceof Error ? error.message : error);
          }
          const message = error instanceof McpToolError ? error.message : "tool failed";
          return { result: { isError: true, content: [{ type: "text", text: message }] } };
        }
      }
      default:
        return rpcError(-32601, `Method not found: ${method}`);
    }
  }

  /** Answers one JSON-RPC message; notifications and client responses get no reply. */
  async function handleMessage(instance: Hocuspocus, info: McpTokenInfo, message: unknown): Promise<unknown> {
    if (!isRecord(message) || message.jsonrpc !== "2.0") {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
    }
    if (typeof message.method !== "string" || !("id" in message)) return undefined;
    const params = isRecord(message.params) ? message.params : {};
    return { jsonrpc: "2.0", id: message.id, ...(await dispatch(instance, info, message.method, params)) };
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
      if (info === null || info.resource === null || trimSlashes(info.resource) !== trimSlashes(deps.config.resourceUrl)) {
        send(response, 401, undefined, { "www-authenticate": challenge("invalid_token") });
        return true;
      }

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
        const replies = (await Promise.all(payload.map((m) => handleMessage(instance, info, m)))).filter(
          (reply) => reply !== undefined,
        );
        if (replies.length === 0) send(response, 202);
        else send(response, 200, replies);
        return true;
      }
      const reply = await handleMessage(instance, info, payload);
      if (reply === undefined) send(response, 202);
      else send(response, 200, reply);
      return true;
    },
  };
}
