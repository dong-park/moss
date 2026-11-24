/**
 * wall-marker 리뷰 W5 — Dexie는 v6로 돌아왔다. 벽 획의 원본은 보드 Y.Doc 하나뿐이고 로컬 미러
 * (`strokes` 테이블)는 없다. v7은 이 브랜치 밖으로 나간 적이 없다.
 */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDB, type MossDB } from "@/state/db/schema";

const dbs: MossDB[] = [];
let n = 0;
const nextName = () => `moss-strokes-test-${Date.now()}-${n++}`;

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe("Dexie v6 — strokes 테이블 없음", () => {
  it("스키마가 v6이고 strokes 테이블이 없다", async () => {
    const db = createDB(nextName());
    dbs.push(db);
    await db.open();
    expect(db.verno).toBe(6);
    expect(db.tables.map((t) => t.name)).not.toContain("strokes");
    expect((db as unknown as { strokes?: unknown }).strokes).toBeUndefined();
  });

  it("v6 데이터는 그대로 열린다", async () => {
    const name = nextName();
    const v6 = new Dexie(name);
    v6.version(6).stores({
      notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
      boards: "id, isSystem, lastOpenedAt, parentBoardId",
      connections: "id, sourceNoteId, targetNoteId, status",
      embeddings: "noteId, updatedAt",
      settings: "id",
      trash: "id, deletedAt",
      trashConnections: "id, sourceNoteId, targetNoteId",
    });
    await v6.open();
    await v6.table("boards").put({
      id: "b1",
      name: "옛 보드",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    v6.close();

    const db = createDB(name);
    dbs.push(db);
    await db.open();
    expect(db.verno).toBe(6);
    expect((await db.boards.get("b1"))?.name).toBe("옛 보드");
  });

  it("이 브랜치에서 잠깐 만들어진 v7(strokes 테이블이 더 있는 DB)도 열린다", async () => {
    const name = nextName();
    const v7 = new Dexie(name);
    v7.version(7).stores({
      notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
      boards: "id, isSystem, lastOpenedAt, parentBoardId",
      connections: "id, sourceNoteId, targetNoteId, status",
      embeddings: "noteId, updatedAt",
      settings: "id",
      trash: "id, deletedAt",
      trashConnections: "id, sourceNoteId, targetNoteId",
      strokes: "id, boardId",
    });
    await v7.open();
    await v7.table("boards").put({
      id: "b1",
      name: "v7에서 만든 보드",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    v7.close();

    const db = createDB(name);
    dbs.push(db);
    await db.open();
    expect((await db.boards.get("b1"))?.name).toBe("v7에서 만든 보드");
  });
});
