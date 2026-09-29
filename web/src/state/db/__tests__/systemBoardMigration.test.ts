/**
 * FEAT-onboarding-routes n1 — 시스템 보드 UUID 이전.
 *
 * 실경로: y-indexeddb를 stub하지 않고 실제 IndexeddbPersistence로 쓴 뒤 다시 열어
 * 확인한다. 검증: 이전 전후 메모 수·내용 동일, 두 번 돌려도 중복 없음, 중단 후 재실행.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clearDocument } from "y-indexeddb";
import {
  createDB,
  DEFAULT_SETTINGS,
  type Board,
  type MossDB,
  type Note,
} from "@/state/db/schema";
import {
  LEGACY_SYSTEM_DOC_KEY,
  migrateSystemBoard,
} from "@/state/db/systemBoardMigration";
import { boardDocName, openBoardDoc } from "@/state/ydoc/doc";
import { putNote, readBoard, readNotes } from "@/state/ydoc/model";
import { SYSTEM_BOARD_ID } from "@/state/boardIds";

let counter = 0;
const dbs: MossDB[] = [];
const docIds = new Set<string>([SYSTEM_BOARD_ID, LEGACY_SYSTEM_DOC_KEY]);

function freshDB(): MossDB {
  const db = createDB(`moss-sys-${Date.now()}-${counter++}`);
  dbs.push(db);
  return db;
}

afterEach(async () => {
  for (const id of docIds) {
    await clearDocument(boardDocName(id));
  }
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

const now = 1_700_000_000_000;

function makeNote(id: string, boardId: string | null): Note {
  return {
    id,
    boardId,
    kind: "text",
    x: 10,
    y: 20,
    width: 240,
    rotation: 0,
    content: `본문 ${id}`,
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
  };
}

function makeBoard(id: string, over: Partial<Board> = {}): Board {
  return {
    id,
    name: `보드 ${id}`,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ...over,
  };
}

async function readPersisted(boardId: string) {
  const handle = openBoardDoc(boardId);
  await handle.whenLoaded;
  const snapshot = { board: readBoard(handle.doc), notes: readNotes(handle.doc) };
  await handle.destroy();
  return snapshot;
}

describe("n1 · 시스템 보드 UUID 이전", () => {
  it("boardId=null 메모를 UUID로 옮기고 보드 행을 만든다 (내용 보존)", async () => {
    const db = freshDB();
    await db.open();
    await db.notes.bulkPut([
      makeNote("a", null),
      makeNote("b", null),
      makeNote("c", "b1"),
    ]);
    await db.settings.put({ ...DEFAULT_SETTINGS });

    const result = await migrateSystemBoard(db);
    expect(result.migrated).toBe(true);
    expect(result.boardId).toBe(SYSTEM_BOARD_ID);
    expect(result.movedNotes).toBe(2);

    const board = await db.boards.get(SYSTEM_BOARD_ID);
    expect(board?.isSystem).toBe(true);
    expect((await db.notes.get("a"))?.boardId).toBe(SYSTEM_BOARD_ID);
    expect((await db.notes.get("b"))?.boardId).toBe(SYSTEM_BOARD_ID);
    expect((await db.notes.get("c"))?.boardId).toBe("b1");
    // 내용·수는 그대로다.
    expect((await db.notes.get("a"))?.content).toBe("본문 a");
    expect(
      await db.notes.filter((n) => n.boardId === SYSTEM_BOARD_ID).count(),
    ).toBe(2);

    const settings = await db.settings.get("singleton");
    expect(settings?.systemBoardId).toBe(SYSTEM_BOARD_ID);
    expect(settings?.systemBoardMigratedAt).toBeTypeOf("number");
  });

  it("레거시 Yjs 문서(moss-board-system)의 내용을 새 문서로 옮긴다", async () => {
    const db = freshDB();
    await db.open();
    await db.settings.put({ ...DEFAULT_SETTINGS });

    const legacy = openBoardDoc(LEGACY_SYSTEM_DOC_KEY);
    await legacy.whenLoaded;
    putNote(legacy.doc, makeNote("y1", null));
    putNote(legacy.doc, makeNote("y2", null));
    await legacy.destroy();

    const result = await migrateSystemBoard(db);
    expect(result.migrated).toBe(true);

    const moved = await readPersisted(SYSTEM_BOARD_ID);
    expect(moved.notes.map((n) => n.id).sort()).toEqual(["y1", "y2"]);
    expect(moved.board.isSystem).toBe(true);
    // 문서 안에서도 boardId가 새 id로 재매핑된다.
    expect(moved.notes.every((n) => n.boardId === SYSTEM_BOARD_ID)).toBe(true);
    expect(moved.notes.find((n) => n.id === "y1")?.content).toBe("본문 y1");

    // 옛 문서는 비워진다 — 다음 실행이 다시 스캔하지 않는다.
    const legacyAfter = openBoardDoc(LEGACY_SYSTEM_DOC_KEY);
    await legacyAfter.whenLoaded;
    expect(readNotes(legacyAfter.doc)).toEqual([]);
    await legacyAfter.destroy();
  });

  it("두 번 돌려도 중복이 없다 (멱등)", async () => {
    const db = freshDB();
    await db.open();
    await db.notes.bulkPut([makeNote("a", null), makeNote("b", null)]);
    await db.settings.put({ ...DEFAULT_SETTINGS });

    await migrateSystemBoard(db);
    const second = await migrateSystemBoard(db);

    expect(second.migrated).toBe(false);
    expect(second.movedNotes).toBe(0);
    expect(
      await db.notes.filter((n) => n.boardId === SYSTEM_BOARD_ID).count(),
    ).toBe(2);
    expect(await db.boards.filter((b) => b.isSystem).count()).toBe(1);
  });

  it("중단 후 재실행해도 같은 id로 수렴하고 중복이 없다", async () => {
    const db = freshDB();
    await db.open();
    await db.notes.bulkPut([makeNote("a", null), makeNote("b", null)]);

    // 1차 실행 뒤 완료 마커를 지워 "마커 쓰기 전에 브라우저가 닫힌" 상태를 만든다.
    await migrateSystemBoard(db);
    const settings = await db.settings.get("singleton");
    expect(settings).toBeDefined();
    await db.settings.put({ ...settings!, systemBoardMigratedAt: undefined });

    const resumed = await migrateSystemBoard(db);
    expect(resumed.migrated).toBe(true);
    expect(resumed.boardId).toBe(SYSTEM_BOARD_ID);
    // 이미 옮겨진 메모는 다시 세지 않는다.
    expect(resumed.movedNotes).toBe(0);
    expect(
      await db.notes.filter((n) => n.boardId === SYSTEM_BOARD_ID).count(),
    ).toBe(2);
    expect((await db.boards.get(SYSTEM_BOARD_ID))?.isSystem).toBe(true);
  });

  it("기존 시스템 보드 행의 이름을 보존한다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard(SYSTEM_BOARD_ID, { name: "머무는 생각", isSystem: true }));
    await db.settings.put({ ...DEFAULT_SETTINGS });

    await migrateSystemBoard(db);
    expect((await db.boards.get(SYSTEM_BOARD_ID))?.name).toBe("머무는 생각");
  });
});
