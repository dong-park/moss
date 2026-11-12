import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { MemoryDocumentStore } from "../src/documentStore.ts";
import { createSyncServer, type SyncServer } from "../src/server.ts";
import { makeConfig, signBoardToken, waitFor } from "./helpers.ts";

const BOARD = `b-${crypto.randomUUID().slice(0, 8)}`;
const USER = crypto.randomUUID();

interface Handle { doc: Y.Doc; provider: HocuspocusProvider; websocket: HocuspocusProviderWebsocket }

describe("dirty-document tracking", () => {
  let store: MemoryDocumentStore;
  let sync: SyncServer;
  let url: string;
  let failing: boolean;
  const open: Handle[] = [];

  beforeEach(async () => {
    store = new MemoryDocumentStore();
    failing = false;
    const original = store.store.bind(store);
    store.store = async (name, state) => {
      if (failing) throw new Error("database unavailable");
      await original(name, state);
    };
    sync = createSyncServer({
      config: makeConfig(),
      store,
      isMember: async () => true,
      boardExists: async () => true,
    });
    url = `ws://127.0.0.1:${await sync.listen()}`;
  });

  afterEach(async () => {
    for (const handle of open.splice(0)) close(handle);
    await sync.destroy().catch(() => {});
  });

  async function connected(): Promise<Handle> {
    const token = await signBoardToken({ userId: USER, boardId: BOARD });
    const doc = new Y.Doc();
    const websocket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: WebSocket });
    const provider = new HocuspocusProvider({ name: BOARD, token, document: doc, websocketProvider: websocket });
    provider.attach();
    const handle = { doc, provider, websocket };
    open.push(handle);
    await waitFor(() => provider.isSynced);
    return handle;
  }

  function close(handle: Handle): void {
    handle.provider.destroy();
    handle.websocket.destroy();
    handle.doc.destroy();
  }

  async function persisted(): Promise<Y.Doc> {
    const state = await store.fetch(BOARD);
    expect(state).not.toBeNull();
    const restored = new Y.Doc();
    Y.applyUpdate(restored, state!);
    return restored;
  }

  const serverDoc = () => sync.server.hocuspocus.documents.get(BOARD);

  test("per-update change tracking does not encode the whole board (bounded benchmark)", async () => {
    // A ~9 MB board, just under the 10 MB document limit used in production.
    const big = new Y.Doc();
    const text = big.getText("bulk");
    for (let i = 0; i < 9; i++) text.insert(text.length, "x".repeat(1024 * 1024));
    let started = performance.now();
    const encoded = Y.encodeStateAsUpdate(big);
    const oneEncodeMs = performance.now() - started;
    expect(encoded.byteLength).toBeGreaterThan(9 * 1024 * 1024);
    const updates = 50;
    started = performance.now();
    for (let i = 0; i < updates; i++) {
      await sync.server.hocuspocus.hooks("onChange", { documentName: `bench-${BOARD}`, document: big, instance: sync.server.hocuspocus } as never);
    }
    const hookMs = performance.now() - started;
    console.log(JSON.stringify({ benchmark: "onChange", board_bytes: encoded.byteLength, one_full_encode_ms: Number(oneEncodeMs.toFixed(2)), updates, total_hook_ms: Number(hookMs.toFixed(2)) }));
    // Encoding on every update costs ~updates x oneEncode; tracking must cost less than ONE full encode.
    expect(hookMs).toBeLessThan(Math.max(oneEncodeMs, 5));
    big.destroy();
  });

  test("a failed store survives unload and is persisted at shutdown", async () => {
    const a = await connected();
    failing = true;
    a.doc.getMap("proof").set("edit", "survives unload");
    await waitFor(() => serverDoc()?.getMap("proof").get("edit") === "survives unload");
    open.splice(open.indexOf(a), 1); close(a);
    // Hocuspocus stores on last disconnect (which fails here) and then unloads the document.
    await waitFor(() => serverDoc() === undefined);
    failing = false;
    await sync.destroy();
    expect((await persisted()).getMap("proof").get("edit")).toBe("survives unload");
  });

  test("a change arriving while a store is in flight stays dirty until persisted", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const original = store.store;
    store.store = async (name, state) => {
      calls += 1;
      if (calls === 1) await barrier;
      await original(name, state);
    };
    sync.server.hocuspocus.configuration.debounce = 0;
    sync.server.hocuspocus.configuration.maxDebounce = 0;
    const a = await connected();
    a.doc.getMap("proof").set("first", "1");
    await waitFor(() => calls === 1);
    // Keep the second change from being stored by its own debounce: only shutdown may persist it.
    sync.server.hocuspocus.configuration.debounce = 60000;
    sync.server.hocuspocus.configuration.maxDebounce = 60000;
    a.doc.getMap("proof").set("second", "2");
    await waitFor(() => serverDoc()?.getMap("proof").get("second") === "2");
    release();
    await waitFor(() => store.has(BOARD));
    await sync.destroy();
    const restored = await persisted();
    expect(restored.getMap("proof").get("first")).toBe("1");
    expect(restored.getMap("proof").get("second")).toBe("2");
  });

  test("retained failed bytes are merged with later edits of a reloaded board", async () => {
    const a = await connected();
    failing = true;
    a.doc.getMap("proof").set("lost-store", "kept");
    await waitFor(() => serverDoc()?.getMap("proof").get("lost-store") === "kept");
    open.splice(open.indexOf(a), 1); close(a);
    await waitFor(() => serverDoc() === undefined);
    // A fresh client (no local copy of the failed edit) reloads the stale snapshot and edits.
    failing = true;
    const b = await connected();
    b.doc.getMap("proof").set("later", "also kept");
    await waitFor(() => serverDoc()?.getMap("proof").get("later") === "also kept");
    failing = false;
    await sync.destroy();
    const restored = await persisted();
    expect(restored.getMap("proof").get("lost-store")).toBe("kept");
    expect(restored.getMap("proof").get("later")).toBe("also kept");
  });

  test("shutdown still fails closed while the store stays unavailable", async () => {
    const a = await connected();
    failing = true;
    a.doc.getMap("proof").set("edit", "unsaved");
    await waitFor(() => serverDoc()?.getMap("proof").get("edit") === "unsaved");
    await expect(sync.destroy()).rejects.toThrow("shutdown persistence failed");
  });
});
