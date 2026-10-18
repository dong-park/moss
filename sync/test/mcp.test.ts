import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { z } from "zod";
import { loadConfig } from "../src/config.ts";
import { MemoryDocumentStore } from "../src/documentStore.ts";
import {
  McpToolError,
  createKtorIntrospector,
  type McpTokenInfo,
  type McpTool,
} from "../src/mcp.ts";
import { createSyncServer, type SyncServer } from "../src/server.ts";
import { makeConfig, signBoardToken, TEST_INTERNAL_SECRET, TEST_SECRET, waitFor } from "./helpers.ts";

const BOARD = `b-${crypto.randomUUID().slice(0, 8)}`;
const USER = crypto.randomUUID();
const STRANGER = crypto.randomUUID();
const RESOURCE = "https://moss.example/mcp";
const MCP_CONFIG = {
  ktorUrl: "http://ktor.internal:8080",
  resourceUrl: RESOURCE,
  publicBaseUrl: "https://moss.example",
};

const tokens = new Map<string, McpTokenInfo>();
const info = (userId: string, resource: string | null = RESOURCE): McpTokenInfo => ({
  userId,
  clientId: "client-1",
  grantId: "grant-1",
  resource,
});

/** Writes one note into the board's live document. */
const writeNote: McpTool = {
  name: "write_note",
  description: "test tool",
  inputSchema: { board: z.string() },
  async call(args, context) {
    const boardId = String(args.board);
    return context.withBoard(boardId, (connection) =>
      connection.transact((doc) => {
        doc.getMap("notes").set("from-mcp", "hello");
        return "written";
      }).then(() => "written"),
    );
  },
};

const failing: McpTool = {
  name: "boom",
  description: "test tool",
  inputSchema: { expected: z.boolean().optional() },
  async call(args) {
    if (args.expected === true) throw new McpToolError("expected failure");
    throw new Error("secret internals");
  },
};

describe("mcp endpoint", () => {
  let sync: SyncServer;
  let port: number;
  let members: Set<string>;
  let introspectFails = false;

  beforeEach(async () => {
    members = new Set([`${BOARD}:${USER}`]);
    introspectFails = false;
    tokens.clear();
    tokens.set("good", info(USER));
    tokens.set("stranger", info(STRANGER));
    tokens.set("wrong-aud", info(USER, "https://other.example/mcp"));
    sync = createSyncServer({
      config: makeConfig(),
      store: new MemoryDocumentStore(),
      isMember: async (boardId, userId) => members.has(`${boardId}:${userId}`),
      boardExists: async () => true,
      mcp: {
        config: MCP_CONFIG,
        introspect: async (token) => {
          if (introspectFails) throw new Error("ktor down");
          return tokens.get(token) ?? null;
        },
        isMember: async (boardId, userId) => members.has(`${boardId}:${userId}`),
        boards: { listBoards: async () => [], fetchSnapshot: async () => null, fileNames: async () => new Map() },
        tools: [writeNote, failing],
      },
    });
    port = await sync.listen();
  });

  afterEach(async () => {
    await sync.destroy();
  });

  const post = (body: unknown, token: string | null = "good", path = "/mcp") =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const jsonOf = (response: Response) => response.json() as Promise<any>; // eslint-disable-line
  const rpc = (method: string, params: unknown = {}, id: number = 1) =>
    ({ jsonrpc: "2.0", id, method, params });
  const callTool = async (name: string, args: unknown, token = "good") => {
    const response = await post(rpc("tools/call", { name, arguments: args }), token);
    expect(response.status).toBe(200);
    return (await response.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };
  };

  test("a request without a token gets a 401 that points at the resource metadata", async () => {
    const response = await post(rpc("ping"), null);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://moss.example/.well-known/oauth-protected-resource"',
    );
  });

  test("an unknown token and a token for another audience are both rejected", async () => {
    for (const token of ["unknown", "wrong-aud"]) {
      const response = await post(rpc("ping"), token);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  test("an unreachable token check answers 503, not 401", async () => {
    introspectFails = true;
    const response = await post(rpc("ping"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
  });

  test("a valid token connects: initialize, ping and an empty-or-listed tool list", async () => {
    const init = await jsonOf(await post(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })));
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeDefined();

    expect((await jsonOf(await post(rpc("ping", {}, 2)))).result).toEqual({});
    const list = await jsonOf(await post(rpc("tools/list", {}, 3)));
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["write_note", "boom"]);
  });

  test("notifications get 202, GET gets 405, other paths fall through to the normal server", async () => {
    expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    const get = await fetch(`http://127.0.0.1:${port}/mcp`);
    expect(get.status).toBe(405);
    const other = await fetch(`http://127.0.0.1:${port}/`);
    expect(other.status).toBe(200);
    expect(await other.text()).toBe("Welcome to Hocuspocus!");
  });

  test("malformed JSON and unknown methods return JSON-RPC errors", async () => {
    const parse = await post("{nope");
    expect(parse.status).toBe(400);
    expect((await jsonOf(parse)).error.code).toBe(-32700);
    const unknown = await jsonOf(await post(rpc("resources/list")));
    expect(unknown.error.code).toBe(-32601);
  });

  test("a member's tool call edits the live board and a connected browser sees it", async () => {
    const doc = new Y.Doc();
    const websocket = new HocuspocusProviderWebsocket({
      url: `ws://127.0.0.1:${port}`,
      WebSocketPolyfill: WebSocket,
    });
    const provider = new HocuspocusProvider({
      name: BOARD,
      token: await signBoardToken({ userId: USER, boardId: BOARD }),
      document: doc,
      websocketProvider: websocket,
    });
    provider.attach();
    try {
      await waitFor(() => provider.isSynced, { label: "browser synced" });
      const reply = await callTool("write_note", { board: BOARD });
      expect(reply.result.content[0]?.text).toBe("written");
      await waitFor(() => doc.getMap("notes").get("from-mcp") === "hello", { label: "browser sees mcp edit" });
    } finally {
      provider.destroy();
      websocket.destroy();
    }
  });

  test("non-members and removed members are refused with one indistinguishable message", async () => {
    const stranger = await callTool("write_note", { board: BOARD }, "stranger");
    const missing = await callTool("write_note", { board: "b-00000000" });
    expect(stranger.result.isError).toBe(true);
    expect(stranger.result.content[0]?.text).toBe(missing.result.content[0]?.text);

    expect((await callTool("write_note", { board: BOARD })).result.isError).toBeUndefined();
    members.delete(`${BOARD}:${USER}`);
    expect((await callTool("write_note", { board: BOARD })).result.isError).toBe(true);
  });

  test("tool failures: expected errors keep their message, unexpected ones are hidden", async () => {
    expect((await callTool("boom", { expected: true })).result.content[0]?.text).toBe("expected failure");
    const hidden = await callTool("boom", {});
    expect(hidden.result.isError).toBe(true);
    expect(hidden.result.content[0]?.text).toBe("tool failed");
    const unknown = await jsonOf(await post(rpc("tools/call", { name: "nope", arguments: {} })));
    expect(unknown.result.isError).toBe(true);
    expect(unknown.result.content[0].text).toContain("nope");
  });

  test("a JSON-RPC batch is refused with 400", async () => {
    const response = await post([rpc("ping", {}, 1), rpc("ping", {}, 2)]);
    expect(response.status).toBe(400);
    expect((await jsonOf(response)).error.code).toBe(-32600);
  });

  test("a token for another audience leaves a warning that tells it from a revoked token", async () => {
    const warn = console.warn;
    const lines: unknown[][] = [];
    console.warn = (...args: unknown[]) => void lines.push(args);
    try {
      expect((await post(rpc("ping"), "wrong-aud")).status).toBe(401);
      expect((await post(rpc("ping"), "unknown")).status).toBe(401);
    } finally {
      console.warn = warn;
    }
    expect(lines).toEqual([["mcp audience mismatch", "https://other.example/mcp", RESOURCE]]);
  });

  test("an oversized body is refused with 413", async () => {
    const response = await post(JSON.stringify({ pad: "x".repeat(1024 * 1024 + 1) }));
    expect(response.status).toBe(413);
  });

  test("a chunked body past the limit is refused too", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(" ".repeat(600 * 1024)));
        controller.enqueue(new TextEncoder().encode(" ".repeat(600 * 1024)));
        controller.close();
      },
    });
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer good" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(response.status).toBe(413);
  });
});

describe("ktor introspector", () => {
  const respond = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });

  test("sends the internal secret and maps an active token", async () => {
    let seen: { url: string; secret: string | null; body: string } | undefined;
    const introspect = createKtorIntrospector(MCP_CONFIG, TEST_INTERNAL_SECRET, (async (url: URL, init: RequestInit) => {
      seen = {
        url: String(url),
        secret: new Headers(init.headers).get("x-moss-internal"),
        body: String(init.body),
      };
      return new Response(
        JSON.stringify({ active: true, sub: USER, client_id: "c", aud: RESOURCE, grant_id: "g" }),
      );
    }) as unknown as typeof fetch);
    expect(await introspect("mat_abc")).toEqual({ userId: USER, clientId: "c", grantId: "g", resource: RESOURCE });
    expect(seen).toEqual({
      url: "http://ktor.internal:8080/oauth/introspect",
      secret: TEST_INTERNAL_SECRET,
      body: "token=mat_abc",
    });
  });

  test("inactive tokens are null; an HTTP failure throws", async () => {
    const inactive = createKtorIntrospector(MCP_CONFIG, "s", respond(200, { active: false }) as unknown as typeof fetch);
    expect(await inactive("x")).toBeNull();
    const broken = createKtorIntrospector(MCP_CONFIG, "s", respond(503, {}) as unknown as typeof fetch);
    await expect(broken("x")).rejects.toThrow("503");
  });
});

describe("mcp config", () => {
  const base = {
    JWT_SECRET: TEST_SECRET,
    DATABASE_URL: "postgres://x",
    SYNC_INTERNAL_SECRET: TEST_INTERNAL_SECRET,
  };

  test("stays off without KTOR_INTERNAL_URL", () => {
    expect(loadConfig(base).mcp).toBeUndefined();
  });

  test("derives the resource URL from the public base like Ktor does", () => {
    const config = loadConfig({
      ...base,
      KTOR_INTERNAL_URL: "http://server:8080",
      PUBLIC_BASE_URL: "https://moss.example/",
    });
    expect(config.mcp).toEqual({
      ktorUrl: "http://server:8080",
      publicBaseUrl: "https://moss.example",
      resourceUrl: "https://moss.example/mcp",
    });
    expect(
      loadConfig({ ...base, KTOR_INTERNAL_URL: "http://server:8080", MCP_RESOURCE_URL: "https://moss.example/mcp/" }).mcp
        ?.resourceUrl,
    ).toBe("https://moss.example/mcp");
  });

  test("rejects a URL that does not parse", () => {
    expect(() => loadConfig({ ...base, KTOR_INTERNAL_URL: "server" })).toThrow("KTOR_INTERNAL_URL");
  });
});
