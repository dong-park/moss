import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";

import { useStorage } from "@/state/storage";
import {
  createDB,
  getDB,
  makeFrameNote,
  resetDB,
  type Note,
} from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;
/** OPFS 첨부 삭제 스파이 — deleteBlob이 부르는 removeEntry. */
let removeEntry: ReturnType<typeof vi.fn>;

function noteOf(id: string): Note {
  const now = Date.now();
  return {
    id,
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
  };
}

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  // deleteBlob: getDirectory → getDirectoryHandle("moss-attachments") → removeEntry(filename).
  removeEntry = vi.fn(async () => {});
  const dirHandle = { removeEntry };
  const rootHandle = {
    getDirectoryHandle: vi.fn(async () => dirHandle),
    removeEntry: vi.fn(async () => {}),
  };
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(async () => rootHandle),
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

async function setup() {
  await useStorage.getState().init();
  return useStorage.getState();
}

describe("FEAT-trash · storage", () => {
  it("AC-1: trashNote는 notes에서 지우고 연결선·보드 이름과 함께 휴지통에 넣는다", async () => {
    const s = await setup();
    await s.saveBoard({ id: "b1", name: "보드 B" });
    await s.saveNote({
      id: "n1",
      boardId: "b1",
      content: "지울 메모",
      x: 300,
      y: 200,
      title: "제목",
    });
    await s.saveNote({ id: "n2", boardId: "b1", content: "이웃" });
    await s.saveConnection({ id: "c1", sourceNoteId: "n1", targetNoteId: "n2" });
    await getDB().embeddings.put({
      noteId: "n1",
      contentHash: "x",
      vector: new Float32Array([1]),
      updatedAt: 1,
    });

    await s.trashNote("n1");

    expect(await getDB().notes.get("n1")).toBeUndefined();
    expect(await getDB().embeddings.get("n1")).toBeUndefined();
    expect(await getDB().connections.get("c1")).toBeUndefined();

    const list = await s.listTrash();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("n1");
    expect([list[0]!.note.x, list[0]!.note.y]).toEqual([300, 200]);
    expect(list[0]!.note.boardId).toBe("b1");
    expect(list[0]!.boardName).toBe("보드 B");
    expect(list[0]!.connections.map((c) => c.id)).toEqual(["c1"]);

    // 기존 조회 경로에는 안 나온다(AC-12).
    expect((await s.loadCards("b1")).map((n) => n.id)).toEqual(["n2"]);
  });

  it("AC-5: 원래 보드가 있으면 원래 좌표로 복구되고 필드가 보존된다", async () => {
    const s = await setup();
    await s.saveBoard({ id: "b1", name: "B" });
    await s.saveNote({
      id: "n1",
      boardId: "b1",
      x: 300,
      y: 200,
      width: 333,
      height: 222,
      content: "본문",
      title: "제목",
      color: "yellow",
      attachmentRef: "opfs:a.png",
      overlay: '{"paths":[]}',
    });
    await s.trashNote("n1");

    const restored = await s.restoreNote("n1", {
      boardId: "other",
      x: 5,
      y: 6,
    });

    expect(restored.id).toBe("n1");
    expect(restored.boardId).toBe("b1");
    expect([restored.x, restored.y]).toEqual([300, 200]);
    expect(restored.width).toBe(333);
    expect(restored.height).toBe(222);
    expect(restored.content).toBe("본문");
    expect(restored.title).toBe("제목");
    expect(restored.color).toBe("yellow");
    expect(restored.attachmentRef).toBe("opfs:a.png");
    expect(restored.overlay).toBe('{"paths":[]}');
    expect(await getDB().notes.get("n1")).toBeDefined();
    expect(await s.listTrash()).toHaveLength(0);
  });

  it("AC-6: 원래 보드가 없으면 fallback 좌표·보드로 복구되고 frameId를 비운다", async () => {
    const s = await setup();
    await s.saveNote({
      id: "n1",
      boardId: "gone",
      x: 300,
      y: 200,
      frameId: "f1",
      content: "x",
    });
    await s.trashNote("n1");

    const restored = await s.restoreNote("n1", { boardId: "b2", x: 11, y: 22 });

    expect(restored.boardId).toBe("b2");
    expect([restored.x, restored.y]).toEqual([11, 22]);
    expect(restored.frameId).toBeUndefined();
  });

  it("AC-7: 판이 같은 보드에 있으면 frameId 유지, 없으면 비운다", async () => {
    const s = await setup();
    await s.saveBoard({ id: "b1", name: "B" });
    const frame = makeFrameNote("b1", 0, 0, 240, 160);
    await s.saveNote(frame);
    await s.saveNote({
      id: "withFrame",
      boardId: "b1",
      frameId: frame.id,
      content: "x",
    });
    await s.saveNote({
      id: "orphanFrame",
      boardId: "b1",
      frameId: "missing-frame",
      content: "y",
    });

    await s.trashNote("withFrame");
    await s.trashNote("orphanFrame");

    const kept = await s.restoreNote("withFrame", { boardId: null, x: 0, y: 0 });
    expect(kept.frameId).toBe(frame.id);
    const cleared = await s.restoreNote("orphanFrame", { boardId: null, x: 0, y: 0 });
    expect(cleared.frameId).toBeUndefined();
  });

  it("AC-8: 복구 시 양 끝이 살아 있는 연결선만 돌아온다", async () => {
    const s = await setup();
    await s.saveBoard({ id: "b1", name: "B" });
    await s.saveNote({ id: "A", boardId: "b1", content: "a" });
    await s.saveNote({ id: "B", boardId: "b1", content: "b" });
    await s.saveNote({ id: "C", boardId: "b1", content: "c" });
    await s.saveConnection({ id: "ab", sourceNoteId: "A", targetNoteId: "B" });
    await s.saveConnection({ id: "ac", sourceNoteId: "A", targetNoteId: "C" });

    await s.trashNote("A");
    await s.trashNote("C");

    await s.restoreNote("A", { boardId: null, x: 0, y: 0 });
    const db = getDB();
    expect(await db.connections.get("ab")).toBeDefined();
    expect(await db.connections.get("ac")).toBeUndefined();

    await s.restoreNote("C", { boardId: null, x: 0, y: 0 });
    expect(await db.connections.get("ac")).toBeDefined();
  });

  it("AC-9: 개별 영구 삭제는 행과 첨부 blob을 지운다", async () => {
    const s = await setup();
    await s.saveNote({ id: "n1", attachmentRef: "opfs:photo.png", content: "x" });
    await s.trashNote("n1");

    await s.purgeTrash(["n1"]);

    expect(await s.listTrash()).toHaveLength(0);
    expect(removeEntry).toHaveBeenCalledWith("photo.png");
  });

  it("AC-10: 비우기는 휴지통 전부와 첨부를 지운다", async () => {
    const s = await setup();
    await s.saveNote({ id: "n1", attachmentRef: "opfs:a.png" });
    await s.saveNote({ id: "n2" });
    await s.trashNote("n1");
    await s.trashNote("n2");

    await s.purgeTrash();

    expect(await s.listTrash()).toHaveLength(0);
    expect(removeEntry).toHaveBeenCalledWith("a.png");
  });

  it("AC-11: 새로고침 뒤에도 휴지통이 유지된다", async () => {
    const s = await setup();
    await s.saveNote({ id: "n1" });
    await s.saveNote({ id: "n2" });
    await s.trashNote("n1");
    await s.trashNote("n2");
    await s.restoreNote("n1", { boardId: null, x: 0, y: 0 });

    // 새 세션 시뮬레이션.
    useStorage.setState({ initialized: false, settings: null, quota: null });
    await useStorage.getState().init();

    const list = await useStorage.getState().listTrash();
    expect(list.map((e) => e.id)).toEqual(["n2"]);
    expect(
      (await useStorage.getState().loadCards(null)).map((n) => n.id),
    ).toEqual(["n1"]);
  });

  it("listTrash는 deletedAt 내림차순", async () => {
    const s = await setup();
    const db = getDB();
    await db.trash.put({
      id: "old",
      note: noteOf("old"),
      connections: [],
      boardName: null,
      deletedAt: 1000,
    });
    await db.trash.put({
      id: "new",
      note: noteOf("new"),
      connections: [],
      boardName: null,
      deletedAt: 2000,
    });

    expect((await s.listTrash()).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("Dexie v6 upgrade: v5 데이터(notes·boards)가 무손실로 남는다", async () => {
    const name = `moss-v6-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const v5 = new Dexie(name);
    v5.version(5).stores({
      notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
      boards: "id, isSystem, lastOpenedAt, parentBoardId",
      connections: "id, sourceNoteId, targetNoteId, status",
      embeddings: "noteId, updatedAt",
      settings: "id",
    });
    await v5.open();
    await v5.table("notes").put(noteOf("n1"));
    await v5.table("boards").put({
      id: "b1",
      name: "B",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    v5.close();

    const db = createDB(name);
    await db.open();
    expect(db.verno).toBe(6);
    expect((await db.notes.get("n1"))?.id).toBe("n1");
    expect(await db.boards.get("b1")).toBeDefined();
    db.close();
    await db.delete();
  });
});
