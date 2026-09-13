import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDB, makeFrameNote, type Note } from "@/state/db/schema";
import { __internal } from "@/state/workspace";

const { isCaptureKind } = __internal;

let counter = 0;
const dbs: { close: () => void; delete: () => Promise<unknown> }[] = [];

function nextName() {
  return `moss-v5-test-${Date.now()}-${counter++}`;
}

afterEach(async () => {
  while (dbs.length) {
    const db = dbs.pop()!;
    db.close();
    try {
      await db.delete();
    } catch {
      /* noop */
    }
  }
});

function makeNote(overrides: Partial<Note> = {}): Note {
  const now = Date.now();
  return {
    id: `n-${Math.random().toString(36).slice(2)}`,
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "hello",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

/** 실제 MossDB의 v4 stores 스키마를 그대로 복제한 임시 DB — v4까지만 연다. */
function openV4Only(name: string): Dexie {
  const stores = {
    notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
    boards: "id, isSystem, lastOpenedAt",
    connections: "id, sourceNoteId, targetNoteId, status",
    embeddings: "noteId, updatedAt",
    settings: "id",
  };
  const db = new Dexie(name);
  db.version(1).stores(stores);
  db.version(4).stores({
    ...stores,
    boards: "id, isSystem, lastOpenedAt, parentBoardId",
  });
  return db;
}

describe("MossDB frame·frameId (FEAT-sticky-redesign n1)", () => {
  it("opens an existing v4 DB and runs the n3 fresh-start upgrade to v5 (notes cleared)", async () => {
    const name = nextName();
    const v4db = openV4Only(name);
    await v4db.open();
    const existing = [makeNote({ id: "a", content: "one" })];
    await v4db.table("notes").bulkPut(existing);
    v4db.close();

    const v5db = createDB(name);
    dbs.push(v5db);
    await v5db.open();
    // v5는 n1이 아니라 n3가 "새 DB로 시작" upgrade와 함께 선언한다(리뷰 P1) — 실제로 5까지 올라간다.
    expect(v5db.verno).toBe(5);

    // n3: v5 upgrade는 이관하지 않고 notes를 비운다.
    const rows = await v5db.notes.toArray();
    expect(rows).toHaveLength(0);
  });

  it("puts and gets a frame row round trip, preserving frameId", async () => {
    const name = nextName();
    const db = createDB(name);
    dbs.push(db);
    await db.open();

    const frame = makeFrameNote("board-1", 10, 20, 300, 200, "내 메모판");
    await db.notes.put(frame);
    const gotFrame = await db.notes.get(frame.id);
    expect(gotFrame?.kind).toBe("frame");
    expect(gotFrame?.width).toBe(300);
    expect(gotFrame?.height).toBe(200);
    expect(gotFrame?.rotation).toBe(0);
    expect(JSON.parse(gotFrame?.content ?? "{}")).toEqual({ name: "내 메모판" });

    const child = makeNote({
      id: "child-1",
      boardId: "board-1",
      frameId: frame.id,
    });
    await db.notes.put(child);
    const gotChild = await db.notes.get(child.id);
    expect(gotChild?.frameId).toBe(frame.id);
  });

  it("makeFrameNote falls back to default name and enforces minimum size", () => {
    const frame = makeFrameNote(null, 0, 0, 100, 50);
    expect(JSON.parse(frame.content)).toEqual({ name: "새 메모판" });
    expect(frame.width).toBe(240);
    expect(frame.height).toBe(160);
    expect(frame.rotation).toBe(0);
  });

  it("excludes frame from capture-kind editing (isCaptureKind)", () => {
    expect(isCaptureKind("frame")).toBe(false);
    expect(isCaptureKind("text")).toBe(true);
  });
});
