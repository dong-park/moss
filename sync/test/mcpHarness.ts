import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { MemoryDocumentStore } from "../src/documentStore.ts";
import type { McpBoardInfo, McpFileUploader, McpTool } from "../src/mcp.ts";
import type { McpLimits } from "../src/mcpLimits.ts";
import { createSyncServer, type SyncServer } from "../src/server.ts";
import { makeConfig, signBoardToken, waitFor } from "./helpers.ts";

export const RESOURCE = "https://moss.example/mcp";
export const USER = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";

export interface McpHarnessOptions {
  tools: readonly McpTool[];
  /** Saved snapshots by board id. */
  docs?: Record<string, Y.Doc>;
  /** Boards USER is a member of. */
  members?: Iterable<string>;
  boards?: McpBoardInfo[];
  limits?: Partial<McpLimits>;
  maxDocumentBytes?: number;
  uploadFile?: McpFileUploader;
}

export class CountingStore extends MemoryDocumentStore {
  stores = 0;
  fetches = 0;
  override async store(name: string, state: Uint8Array): Promise<void> {
    this.stores += 1;
    return super.store(name, state);
  }
  override async fetch(name: string): Promise<Uint8Array | null> {
    this.fetches += 1;
    return super.fetch(name);
  }
}

export interface McpHarness {
  sync: SyncServer;
  port: number;
  store: CountingStore;
  members: Set<string>;
  /** How many membership questions the endpoint asked. */
  memberChecks: { count: number };
  /** How many times the board list query ran. */
  listCalls: { count: number };
  post(body: unknown, token?: string): Promise<Response>;
  call(name: string, args: Record<string, unknown>, token?: string): Promise<{ isError: boolean; text: string }>;
  /** The saved snapshot of a board, decoded. */
  saved(boardId: string): Promise<Y.Doc>;
  /** A browser-like client that has the board open. */
  openAsBrowser(boardId: string): Promise<{ doc: Y.Doc; close(): void }>;
  stop(): Promise<void>;
}

export async function startMcp(options: McpHarnessOptions): Promise<McpHarness> {
  const store = new CountingStore();
  for (const [id, doc] of Object.entries(options.docs ?? {})) await store.store(id, Y.encodeStateAsUpdate(doc));
  store.stores = 0;
  store.fetches = 0;
  const members = new Set(options.members ?? []);
  const memberChecks = { count: 0 };
  const listCalls = { count: 0 };
  const isMember = async (boardId: string, userId: string) => {
    memberChecks.count += 1;
    return userId === USER && members.has(boardId);
  };
  const sync = createSyncServer({
    config: makeConfig(options.maxDocumentBytes === undefined ? {} : { maxDocumentBytes: options.maxDocumentBytes }),
    store,
    isMember,
    boardExists: async () => true,
    mcp: {
      config: { ktorUrl: "http://ktor.internal:8080", resourceUrl: RESOURCE, publicBaseUrl: "https://moss.example" },
      introspect: async (token) =>
        token === "good"
          ? { userId: USER, clientId: "claude-test", grantId: "g", resource: RESOURCE }
          : token === "other"
            ? { userId: OTHER, clientId: "c", grantId: "g", resource: RESOURCE }
            : null,
      isMember,
      boards: {
        listBoards: async (userId) => {
          listCalls.count += 1;
          return userId === USER ? (options.boards ?? []).filter((b) => members.has(b.id)) : [];
        },
        fetchSnapshot: (boardId) => store.fetch(boardId),
        fileNames: async () => new Map(),
      },
      ...(options.uploadFile === undefined ? {} : { uploadFile: options.uploadFile }),
      ...(options.limits === undefined ? {} : { limits: options.limits }),
      tools: options.tools,
    },
  });
  const port = await sync.listen();

  const post = (body: unknown, token = "good") =>
    fetch("http://127.0.0.1:" + port + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
    });

  return {
    sync,
    port,
    store,
    members,
    memberChecks,
    listCalls,
    post,
    async call(name, args, token = "good") {
      const response = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, token);
      if (response.status !== 200) throw new Error("unexpected HTTP " + response.status);
      const body = (await response.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };
      return { isError: body.result.isError === true, text: body.result.content[0]?.text ?? "" };
    },
    async saved(boardId) {
      const doc = new Y.Doc();
      const snapshot = await store.fetch(boardId);
      if (snapshot !== null) Y.applyUpdate(doc, snapshot);
      return doc;
    },
    async openAsBrowser(boardId) {
      const doc = new Y.Doc();
      const websocket = new HocuspocusProviderWebsocket({ url: "ws://127.0.0.1:" + port, WebSocketPolyfill: WebSocket });
      const provider = new HocuspocusProvider({
        name: boardId,
        token: await signBoardToken({ userId: USER, boardId }),
        document: doc,
        websocketProvider: websocket,
      });
      provider.attach();
      await waitFor(() => provider.isSynced, { label: "browser synced" });
      return {
        doc,
        close() {
          provider.destroy();
          websocket.destroy();
        },
      };
    },
    stop: () => sync.destroy(),
  };
}

type Fields = Record<string, unknown>;

export function putNote(doc: Y.Doc, fields: Fields): void {
  const map = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>("notes").set(String(fields.id), map);
  for (const [key, value] of Object.entries(fields)) map.set(key, value);
}

export function putConnection(doc: Y.Doc, fields: Fields): void {
  const map = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>("connections").set(String(fields.id), map);
  for (const [key, value] of Object.entries(fields)) map.set(key, value);
}

/** A note's fields as a plain object, or undefined when it is not in the document. */
export function noteOf(doc: Y.Doc, id: string): Fields | undefined {
  const map = doc.getMap<Y.Map<unknown>>("notes").get(id);
  return map === undefined ? undefined : (map.toJSON() as Fields);
}

/** Id from a reply like "메모를 만들었어요: [mcp-…] · 위치 (…)". */
export function idIn(text: string): string {
  const match = /\[([^\]]+)\]/.exec(text);
  if (match === null) throw new Error("no id in: " + text);
  return match[1]!;
}
