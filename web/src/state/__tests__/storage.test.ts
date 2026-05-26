import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStorage } from "@/state/storage";
import { resetDB, getDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  // navigator.storage 모킹: persist는 true 반환, estimate는 작은 quota.
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 100, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("useStorage init", () => {
  it("opens DB, seeds settings, requests persist once", async () => {
    await useStorage.getState().init();
    const { initialized, settings, quota } = useStorage.getState();
    expect(initialized).toBe(true);
    expect(settings).not.toBeNull();
    expect(settings?.persistGranted).toBe(true);
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
    expect(quota?.usage).toBe(100);
  });

  it("does not re-request persist if already decided", async () => {
    await useStorage.getState().init();
    // 두 번째 init은 noop이어야 함 (initialized=true 가드)
    await useStorage.getState().init();
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
  });

  it("respects existing persistGranted (no second prompt across sessions)", async () => {
    // 첫 세션: 거부됨
    (navigator.storage.persist as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await useStorage.getState().init();
    expect(useStorage.getState().settings?.persistGranted).toBe(false);

    // 새 세션 시뮬레이션: store 리셋, DB는 유지
    useStorage.setState({ initialized: false, settings: null, quota: null });
    (navigator.storage.persist as ReturnType<typeof vi.fn>).mockClear();

    await useStorage.getState().init();
    expect(navigator.storage.persist).not.toHaveBeenCalled();
    expect(useStorage.getState().settings?.persistGranted).toBe(false);
  });
});

describe("useStorage notes", () => {
  beforeEach(async () => {
    await useStorage.getState().init();
  });

  it("saveNote and loadCards round-trip (boardId filter)", async () => {
    const s = useStorage.getState();
    await s.saveNote({ id: "n1", boardId: "b1", content: "hello" });
    await s.saveNote({ id: "n2", boardId: "b1", content: "world" });
    await s.saveNote({ id: "n3", boardId: null, content: "drift" });

    const onB1 = await s.loadCards("b1");
    expect(onB1.map((n) => n.id).sort()).toEqual(["n1", "n2"]);

    const unassigned = await s.loadCards(null);
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].id).toBe("n3");
  });

  it("saveNote merges partial patch over existing", async () => {
    const s = useStorage.getState();
    await s.saveNote({ id: "n1", content: "v1", x: 10, y: 20 });
    await s.saveNote({ id: "n1", content: "v2" });
    const [got] = await s.loadCards(null);
    expect(got.content).toBe("v2");
    expect(got.x).toBe(10);
    expect(got.y).toBe(20);
  });

  it("removeNote cascades connections and embeddings", async () => {
    const s = useStorage.getState();
    await s.saveNote({ id: "n1" });
    await s.saveNote({ id: "n2" });
    await s.saveNote({ id: "n3" });
    await s.saveConnection({
      id: "c1",
      sourceNoteId: "n1",
      targetNoteId: "n2",
    });
    await s.saveConnection({
      id: "c2",
      sourceNoteId: "n2",
      targetNoteId: "n3",
    });

    const db = getDB();
    await db.embeddings.put({
      noteId: "n1",
      contentHash: "x",
      vector: new Float32Array([1]),
      updatedAt: Date.now(),
    });

    await s.removeNote("n1");

    expect(await db.notes.get("n1")).toBeUndefined();
    expect(await db.connections.get("c1")).toBeUndefined();
    expect(await db.connections.get("c2")).toBeDefined();
    expect(await db.embeddings.get("n1")).toBeUndefined();
  });
});

describe("useStorage boards & connections & settings", () => {
  beforeEach(async () => {
    await useStorage.getState().init();
  });

  it("saveBoard / loadBoards / removeBoard (orphans children to null)", async () => {
    const s = useStorage.getState();
    await s.saveBoard({ id: "b1", name: "보드 1" });
    await s.saveBoard({ id: "b2", name: "보드 2" });
    await s.saveNote({ id: "n1", boardId: "b1" });

    const boards = await s.loadBoards();
    expect(boards.map((b) => b.id).sort()).toEqual(["b1", "b2"]);

    await s.removeBoard("b1");
    expect(await s.loadBoards()).toHaveLength(1);
    const orphaned = await s.loadCards(null);
    expect(orphaned.map((n) => n.id)).toContain("n1");
  });

  it("loadConnections filters by noteIds", async () => {
    const s = useStorage.getState();
    await s.saveConnection({ id: "c1", sourceNoteId: "a", targetNoteId: "b" });
    await s.saveConnection({ id: "c2", sourceNoteId: "c", targetNoteId: "d" });
    const filtered = await s.loadConnections(["a"]);
    expect(filtered.map((c) => c.id)).toEqual(["c1"]);
  });

  it("updateSettings merges and persists", async () => {
    const s = useStorage.getState();
    await s.updateSettings({ aiOptOutGlobal: true });
    expect(useStorage.getState().settings?.aiOptOutGlobal).toBe(true);

    // 새 세션처럼 리셋 후 다시 init → 영속 확인
    useStorage.setState({ initialized: false, settings: null, quota: null });
    await useStorage.getState().init();
    expect(useStorage.getState().settings?.aiOptOutGlobal).toBe(true);
  });

  it("refreshQuota updates store", async () => {
    const s = useStorage.getState();
    (navigator.storage.estimate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      usage: 800,
      quota: 1000,
    });
    const q = await s.refreshQuota();
    expect(q?.pct).toBeCloseTo(0.8);
    expect(useStorage.getState().quota?.pct).toBeCloseTo(0.8);
  });
});
