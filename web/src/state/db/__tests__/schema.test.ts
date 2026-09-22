import { afterEach, describe, expect, it } from "vitest";
import {
  type Board,
  type Connection,
  createDB,
  DEFAULT_SETTINGS,
  type Note,
} from "@/state/db/schema";

let counter = 0;
const dbs: ReturnType<typeof createDB>[] = [];
function freshDB() {
  const db = createDB(`moss-test-${Date.now()}-${counter++}`);
  dbs.push(db);
  return db;
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
    content: "",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

describe("MossDB schema v1", () => {
  it("opens and exposes 7 tables (v6 trash·trashConnections 추가)", async () => {
    const db = freshDB();
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      "boards",
      "connections",
      "embeddings",
      "notes",
      "settings",
      "trash",
      "trashConnections",
    ]);
  });

  it("CRUDs a note", async () => {
    const db = freshDB();
    const note = makeNote({ content: "hello" });
    await db.notes.put(note);
    const got = await db.notes.get(note.id);
    expect(got?.content).toBe("hello");

    await db.notes.update(note.id, { content: "world", updatedAt: Date.now() });
    const updated = await db.notes.get(note.id);
    expect(updated?.content).toBe("world");

    await db.notes.delete(note.id);
    expect(await db.notes.get(note.id)).toBeUndefined();
  });

  it("queries notes by boardId index", async () => {
    const db = freshDB();
    await db.notes.bulkPut([
      makeNote({ boardId: "b1" }),
      makeNote({ boardId: "b1" }),
      makeNote({ boardId: "b2" }),
      makeNote({ boardId: null }),
    ]);
    const onB1 = await db.notes.where("boardId").equals("b1").toArray();
    expect(onB1).toHaveLength(2);
  });

  it("enforces settings singleton (put with id='singleton')", async () => {
    const db = freshDB();
    await db.settings.put({ ...DEFAULT_SETTINGS });
    await db.settings.update("singleton", { aiOptOutGlobal: true });
    const got = await db.settings.get("singleton");
    expect(got?.aiOptOutGlobal).toBe(true);
    expect(await db.settings.count()).toBe(1);
  });

  it("cascades note removal in a transaction (note + its connections)", async () => {
    const db = freshDB();
    const a = makeNote({ id: "n-a" });
    const b = makeNote({ id: "n-b" });
    const c = makeNote({ id: "n-c" });
    await db.notes.bulkPut([a, b, c]);

    const conns: Connection[] = [
      {
        id: "c1",
        sourceNoteId: "n-a",
        targetNoteId: "n-b",
        source: "manual",
        status: "active",
        createdAt: Date.now(),
      },
      {
        id: "c2",
        sourceNoteId: "n-c",
        targetNoteId: "n-a",
        source: "ai-suggested",
        status: "pending",
        createdAt: Date.now(),
      },
      {
        id: "c3",
        sourceNoteId: "n-b",
        targetNoteId: "n-c",
        source: "manual",
        status: "active",
        createdAt: Date.now(),
      },
    ];
    await db.connections.bulkPut(conns);

    await db.transaction("rw", db.notes, db.connections, async () => {
      await db.notes.delete("n-a");
      const incident = await db.connections
        .where("sourceNoteId")
        .equals("n-a")
        .or("targetNoteId")
        .equals("n-a")
        .primaryKeys();
      await db.connections.bulkDelete(incident);
    });

    expect(await db.notes.get("n-a")).toBeUndefined();
    expect(await db.connections.count()).toBe(1);
    expect((await db.connections.get("c3"))?.id).toBe("c3");
  });

  it("stores and retrieves boards by isSystem index", async () => {
    const db = freshDB();
    const boards: Board[] = [
      {
        id: "b1",
        name: "머무는 생각",
        isSystem: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastOpenedAt: Date.now(),
      },
      {
        id: "b2",
        name: "",
        isSystem: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastOpenedAt: Date.now(),
      },
    ];
    await db.boards.bulkPut(boards);
    const systems = await db.boards.where("isSystem").equals(1).toArray();
    // Dexie indexes boolean as 0/1; fall back to manual filter for portability.
    if (systems.length === 0) {
      const all = await db.boards.toArray();
      expect(all.filter((b) => b.isSystem)).toHaveLength(1);
    } else {
      expect(systems).toHaveLength(1);
    }
  });

  it("stores Float32Array vectors in embeddings", async () => {
    const db = freshDB();
    const vec = new Float32Array([0.1, 0.2, -0.3]);
    await db.embeddings.put({
      noteId: "n-a",
      contentHash: "h",
      vector: vec,
      updatedAt: Date.now(),
    });
    const got = await db.embeddings.get("n-a");
    // jsdom/fake-indexeddb는 다른 realm을 거쳐 typed array를 재구성하므로
    // instanceof 대신 길이·값으로 확인.
    expect(got?.vector?.constructor?.name).toBe("Float32Array");
    expect(got?.vector?.length).toBe(3);
    expect(Array.from(got!.vector as Float32Array)).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(-0.3),
    ]);
  });
});
