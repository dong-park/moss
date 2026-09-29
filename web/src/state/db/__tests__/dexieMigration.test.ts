/**
 * FEAT-collab-auth n2 — Dexie v6 → Yjs 문서 자동 이전.
 *
 * 실경로: y-indexeddb를 stub하지 않고 실제 IndexeddbPersistence로 쓴 뒤
 * 다시 열어 값을 확인한다.
 */
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { clearDocument } from "y-indexeddb";
import {
  createDB,
  DEFAULT_SETTINGS,
  type Board,
  type Connection,
  type MossDB,
  type Note,
  type TrashEntry,
} from "@/state/db/schema";
import {
  boardsAtFailureLimit,
  MIGRATION_FAILURE_LIMIT,
  MIGRATION_VERSION,
  migrateDexieBoards,
  withMigrationLock,
  type MigrationResult,
  type OpenBoardDocFn,
} from "@/state/db/dexieMigration";
import { boardDocName, openBoardDoc, type BoardDocHandle } from "@/state/ydoc/doc";
import {
  readBoard,
  readConnections,
  readNotes,
  toSharedBoard,
  toSharedNote,
} from "@/state/ydoc/model";
import { SYSTEM_BOARD_ID } from "@/state/workspace";

let counter = 0;
const dbs: MossDB[] = [];
const docIds = new Set<string>();

function freshDB(): MossDB {
  const db = createDB(`moss-mig-${Date.now()}-${counter++}`);
  dbs.push(db);
  return db;
}

function trackDoc(boardId: string): string {
  docIds.add(boardId);
  return boardId;
}

afterEach(async () => {
  for (const id of docIds) {
    await clearDocument(boardDocName(id));
  }
  docIds.clear();
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
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeBoard(id: string, over: Partial<Board> = {}): Board {
  trackDoc(id);
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

function makeNote(id: string, boardId: string | null, over: Partial<Note> = {}): Note {
  return {
    id,
    boardId,
    kind: "text",
    x: 10,
    y: 20,
    width: 240,
    height: 96,
    rotation: 0,
    content: `본문 ${id}`,
    title: `제목 ${id}`,
    color: "#123456",
    overlay: '{"paths":[]}',
    aiOptOut: false,
    createdAt: now,
    updatedAt: now + 1,
    lastVisitedAt: now + 2,
    ...over,
  };
}

function makeConn(id: string, source: string, target: string): Connection {
  return {
    id,
    sourceNoteId: source,
    targetNoteId: target,
    source: "manual",
    status: "active",
    createdAt: now,
  };
}

function makeTrash(id: string, boardName: string | null): TrashEntry {
  return { id, note: makeNote(id, null), boardName, deletedAt: now };
}

async function readPersisted(boardId: string) {
  const handle = openBoardDoc(boardId);
  await handle.whenLoaded;
  const snapshot = {
    board: readBoard(handle.doc),
    notes: readNotes(handle.doc),
    connections: readConnections(handle.doc),
  };
  await handle.destroy();
  return snapshot;
}

async function persistResult(db: MossDB, result: MigrationResult): Promise<void> {
  const current = (await db.settings.get("singleton")) ?? { ...DEFAULT_SETTINGS };
  await db.settings.put({
    ...current,
    migratedDocs: result.migratedDocs,
    migrationFailures: result.migrationFailures,
    dexieMigrationVersion: result.dexieMigrationVersion,
  });
}

function openerFailingFor(badId: string, delegate: OpenBoardDocFn = openBoardDoc): OpenBoardDocFn {
  return (id) => {
    if (id === badId) throw new Error(`이전 실패 주입: ${id}`);
    return delegate(id);
  };
}

describe("AC-2 · Dexie v6 보드 자동 이전 (무손실)", () => {
  it("보드 3·메모 50·연결선 10·휴지통 5가 같은 값으로 변환되고 원본은 남는다", async () => {
    const db = freshDB();
    await db.open();
    trackDoc(SYSTEM_BOARD_ID);

    const boards = [makeBoard("b1"), makeBoard("b2"), makeBoard("b3")];

    const notes: Note[] = [];
    for (let i = 0; i < 20; i++) notes.push(makeNote(`b1-n${i}`, "b1"));
    for (let i = 0; i < 15; i++) notes.push(makeNote(`b2-n${i}`, "b2"));
    for (let i = 0; i < 10; i++) notes.push(makeNote(`b3-n${i}`, "b3"));
    // 시스템 보드 메모 5장 — boardId=null.
    for (let i = 0; i < 5; i++) notes.push(makeNote(`sys-n${i}`, null));

    const connections: Connection[] = [];
    for (let i = 0; i < 4; i++) connections.push(makeConn(`c-b1-${i}`, `b1-n${i}`, `b1-n${i + 1}`));
    for (let i = 0; i < 3; i++) connections.push(makeConn(`c-b2-${i}`, `b2-n${i}`, `b2-n${i + 1}`));
    for (let i = 0; i < 3; i++) connections.push(makeConn(`c-b3-${i}`, `b3-n${i}`, `b3-n${i + 1}`));

    const trash = [
      makeTrash("t1", "b1"),
      makeTrash("t2", "b1"),
      makeTrash("t3", "b2"),
      makeTrash("t4", "b3"),
      makeTrash("t5", null),
    ];

    await db.boards.bulkPut(boards);
    await db.notes.bulkPut(notes);
    await db.connections.bulkPut(connections);
    await db.trash.bulkPut(trash);
    await db.settings.put({ ...DEFAULT_SETTINGS, aiOptOutGlobal: true, installPromptShown: true });

    const result = await migrateDexieBoards(db);
    // n1: 시스템 보드 id는 UUID라 문자열 정렬에서 맨 앞에 온다.
    expect(result.migrated.sort()).toEqual([SYSTEM_BOARD_ID, "b1", "b2", "b3"]);
    expect(result.failed).toEqual([]);
    await persistResult(db, result);

    for (const board of boards) {
      const got = await readPersisted(board.id);
      expect(got.board).toEqual(toSharedBoard(board));
      const expected = notes.filter((n) => n.boardId === board.id).map(toSharedNote);
      expect(got.notes.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        expected.sort((a, b) => a.id.localeCompare(b.id)),
      );
    }

    const system = await readPersisted(SYSTEM_BOARD_ID);
    const systemExpected = notes.filter((n) => n.boardId === null).map(toSharedNote);
    expect(system.notes.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      systemExpected.sort((a, b) => a.id.localeCompare(b.id)),
    );

    // 연결선 10건이 보드별 문서에 흩어져 있지만 총합은 그대로다.
    const b1 = await readPersisted("b1");
    const b2 = await readPersisted("b2");
    const b3 = await readPersisted("b3");
    const migratedConnections = [
      ...b1.connections,
      ...b2.connections,
      ...b3.connections,
      ...system.connections,
    ];
    expect(migratedConnections.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...connections].sort((a, b) => a.id.localeCompare(b.id)),
    );

    // 원본 보존.
    expect(await db.notes.count()).toBe(50);
    expect(await db.boards.count()).toBe(3);
    expect(await db.connections.count()).toBe(10);
    expect(await db.trash.count()).toBe(5);

    // 설정의 사용자 값은 그대로 — 이전 상태만 얹힌다.
    const settings = await db.settings.get("singleton");
    expect(settings?.aiOptOutGlobal).toBe(true);
    expect(settings?.installPromptShown).toBe(true);
    expect(settings?.uiLocale).toBe(DEFAULT_SETTINGS.uiLocale);
    expect(settings?.migratedDocs).toContain("b1");
  });

  it("두 번 실행해도 중복 없이 멱등이다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("b1"));
    await db.notes.put(makeNote("n1", "b1"));
    await db.notes.put(makeNote("n2", "b1"));

    const first = await migrateDexieBoards(db);
    expect(first.migrated).toEqual(["b1"]);
    await persistResult(db, first);

    const second = await migrateDexieBoards(db);
    expect(second.migrated).toEqual([]);
    expect(second.alreadyDone).toEqual(["b1"]);

    const got = await readPersisted("b1");
    expect(got.notes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });
});

describe("AC-3 · 이전 실패 격리와 재시도", () => {
  it("한 보드가 예외를 던져도 나머지는 변환되고 다음 실행에 재시도한다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.bulkPut([makeBoard("good"), makeBoard("bad")]);
    await db.notes.bulkPut([makeNote("g1", "good"), makeNote("x1", "bad")]);

    const first = await migrateDexieBoards(db, openerFailingFor("bad"));
    expect(first.migrated).toEqual(["good"]);
    expect(first.failed).toEqual(["bad"]);
    expect(first.migrationFailures.bad).toBe(1);
    await persistResult(db, first);

    // good은 이미 문서에 있다.
    const good = await readPersisted("good");
    expect(good.notes.map((n) => n.id)).toEqual(["g1"]);

    // 다음 실행 — 이번엔 bad도 성공한다.
    const second = await migrateDexieBoards(db, openBoardDoc);
    expect(second.migrated).toEqual(["bad"]);
    expect(second.failed).toEqual([]);
    expect(second.migrationFailures.bad).toBeUndefined();

    const bad = await readPersisted("bad");
    expect(bad.notes.map((n) => n.id)).toEqual(["x1"]);
  });

  it(`${MIGRATION_FAILURE_LIMIT}회 실패하면 자동 재시도를 멈추고 한도 상태를 노출한다`, async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("bad"));
    await db.notes.put(makeNote("x1", "bad"));

    let result = await migrateDexieBoards(db, openerFailingFor("bad"));
    for (let i = 2; i <= MIGRATION_FAILURE_LIMIT; i++) {
      expect(result.failed).toEqual(["bad"]);
      expect(result.migrationFailures.bad).toBe(i - 1);
      await persistResult(db, result);
      result = await migrateDexieBoards(db, openerFailingFor("bad"));
    }
    await persistResult(db, result);

    expect(result.migrationFailures.bad).toBe(MIGRATION_FAILURE_LIMIT);
    expect(boardsAtFailureLimit(result.migrationFailures)).toEqual(["bad"]);

    // 한도에 닿은 뒤에는 실패 주입이 없어도(=열 수 있어도) 건너뛴다.
    const afterLimit = await migrateDexieBoards(db, openBoardDoc);
    expect(afterLimit.migrated).toEqual([]);
    expect(afterLimit.atFailureLimit).toEqual(["bad"]);
  });
});

describe("성공 기준 · 메모 1,000장 보드 변환 5초 이내", () => {
  it("1,000장 보드를 5초 안에 변환한다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("big"));
    const notes: Note[] = [];
    for (let i = 0; i < 1000; i++) notes.push(makeNote(`n${i}`, "big"));
    await db.notes.bulkPut(notes);

    const started = Date.now();
    const result = await migrateDexieBoards(db);
    const elapsed = Date.now() - started;

    expect(result.migrated).toEqual(["big"]);
    expect(elapsed).toBeLessThan(5000);

    const got = await readPersisted("big");
    expect(got.notes).toHaveLength(1000);
  }, 30_000);
});

describe("n2 재심사 반영", () => {
  it("P1-1 · 버전이 맞고 남은 실패가 없으면 Dexie를 스캔하지 않는다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("b1"));
    await db.notes.put(makeNote("n1", "b1"));

    const first = await migrateDexieBoards(db);
    expect(first.dexieMigrationVersion).toBe(MIGRATION_VERSION);
    await persistResult(db, first);

    // 이전이 끝난 뒤 새로 생긴 보드는 다시 스캔하지 않으므로 옮겨지지 않는다.
    await db.boards.put(makeBoard("late"));
    await db.notes.put(makeNote("ln", "late"));

    const second = await migrateDexieBoards(db);
    expect(second.migrated).toEqual([]);
    expect(second.dexieMigrationVersion).toBe(MIGRATION_VERSION);
    expect(second.migratedDocs).toEqual(["b1"]);

    const late = await readPersisted("late");
    expect(late.notes).toEqual([]);
  });

  it("P1-2 · 보드를 동시에 최대 4개까지만 연다", async () => {
    const db = freshDB();
    await db.open();
    for (let i = 0; i < 5; i++) {
      await db.boards.put(makeBoard(`b${i}`));
      await db.notes.put(makeNote(`n${i}`, `b${i}`));
    }

    let inFlight = 0;
    let maxInFlight = 0;
    const slowOpener: OpenBoardDocFn = (id) => {
      const handle = openBoardDoc(id);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return {
        ...handle,
        whenLoaded: handle.whenLoaded.then(() => delay(5)),
        destroy: async () => {
          try {
            await handle.destroy();
          } finally {
            inFlight--;
          }
        },
      };
    };

    const result = await migrateDexieBoards(db, slowOpener);
    expect(result.migrated).toHaveLength(5);
    expect(maxInFlight).toBe(4);
  });

  it("P1-3a · whenLoaded가 늦으면 보드별 타임아웃으로 실패 기록", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("slow"));
    await db.notes.put(makeNote("s1", "slow"));

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const opener: OpenBoardDocFn = (id) => {
      const handle = openBoardDoc(id);
      if (id !== "slow") return handle;
      return { ...handle, whenLoaded: gate.then(() => handle.whenLoaded) };
    };

    const result = await migrateDexieBoards(db, opener, MIGRATION_FAILURE_LIMIT, {
      perDocMs: 20,
    });
    expect(result.failed).toEqual(["slow"]);
    expect(result.migrationFailures.slow).toBe(1);

    release();
    await delay(40);
  });

  it("P1-3b · whenLoaded가 영원히 pending이어도 문서별 타임아웃으로 실패하고 핸들을 정리한다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("never"));
    await db.notes.put(makeNote("x1", "never"));

    let destroys = 0;
    let opens = 0;
    const opener: OpenBoardDocFn = (id) => {
      const handle = openBoardDoc(id);
      opens++;
      // 첫 open(쓰기)은 정상, 두 번째 open(검증)만 영원히 pending — 검증 핸들 누수를 검증한다.
      return {
        ...handle,
        whenLoaded: opens === 2 ? new Promise<void>(() => {}) : handle.whenLoaded,
        destroy: async () => {
          destroys++;
        },
      };
    };

    const result = await migrateDexieBoards(db, opener, MIGRATION_FAILURE_LIMIT, {
      perDocMs: 20,
    });
    expect(result.failed).toEqual(["never"]);
    expect(result.migrated).toEqual([]);
    // 쓰기 핸들·검증 핸들 모두 타임아웃 시 정리된다(누수 0).
    expect(destroys).toBe(2);
  });

  it("P1-4 · 닫았다 열어 개수가 다르면 영속 실패로 기록", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.put(makeBoard("ghost"));
    await db.notes.put(makeNote("g1", "ghost"));

    let opens = 0;
    const opener: OpenBoardDocFn = (id) => {
      if (id === "ghost" && ++opens === 2) {
        // 검증 재오픈만 빈 문서로 돌려 저장 실패를 흉내낸다.
        return {
          boardId: id,
          doc: new Y.Doc(),
          whenLoaded: Promise.resolve(),
          destroy: async () => {},
        } as unknown as BoardDocHandle;
      }
      return openBoardDoc(id);
    };

    const result = await migrateDexieBoards(db, opener);
    expect(result.failed).toEqual(["ghost"]);
    expect(result.migrated).toEqual([]);
    expect(result.migrationFailures.ghost).toBe(1);
  });

  it("P1-5 · 보드를 가로지르는 연결선은 source 메모의 보드 문서에만 들어간다", async () => {
    const db = freshDB();
    await db.open();
    await db.boards.bulkPut([makeBoard("b1"), makeBoard("b2")]);
    await db.notes.bulkPut([makeNote("n1", "b1"), makeNote("n2", "b2")]);
    await db.connections.put(makeConn("x1", "n1", "n2"));

    const result = await migrateDexieBoards(db);
    expect(result.migrated.sort()).toEqual(["b1", "b2"]);

    const b1 = await readPersisted("b1");
    const b2 = await readPersisted("b2");
    // 소유 문서는 source(n1)의 보드 b1 하나뿐 — b2에는 사본을 두지 않는다(작업 7).
    expect(b1.connections.map((c) => c.id)).toEqual(["x1"]);
    expect(b2.connections.map((c) => c.id)).toEqual([]);
  });

  it("P1-6 · 스키마가 어긋난 행은 거부하고 시스템 보드 행은 정상 이전한다", async () => {
    const db = freshDB();
    await db.open();
    // n1: 시스템 보드도 평범한 보드 행이다 — 이제 거부하지 않고 이전한다.
    await db.boards.put(makeBoard(SYSTEM_BOARD_ID, { name: "시스템", isSystem: true }));
    await db.boards.put(makeBoard("b1"));
    await db.notes.put(makeNote("n1", "b1"));
    await db.notes.put({ ...makeNote("bad-id", "b1"), id: 123 as unknown as string });
    await db.notes.put({ ...makeNote("bad-board", "b1"), boardId: 7 as unknown as string });

    const result = await migrateDexieBoards(db);
    expect([...result.migrated].sort()).toEqual(["b1", SYSTEM_BOARD_ID].sort());
    expect(result.migratedDocs).toContain(SYSTEM_BOARD_ID);

    const b1 = await readPersisted("b1");
    expect(b1.notes.map((n) => n.id)).toEqual(["n1"]);
  });

  it("P2-8 · navigator.locks가 있으면 그 안에서 이전을 실행한다", async () => {
    const calls: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      writable: true,
      value: {
        request: async (name: string, cb: () => Promise<unknown>) => {
          calls.push(name);
          return cb();
        },
      },
    });
    try {
      const got = await withMigrationLock(async () => {
        calls.push("run");
        return "ok";
      });
      expect(got).toBe("ok");
      expect(calls).toEqual(["moss-dexie-migration", "run"]);
    } finally {
      if (desc) Object.defineProperty(navigator, "locks", desc);
      else delete (navigator as unknown as { locks?: unknown }).locks;
    }

    // locks가 없으면 그대로 실행한다.
    await expect(withMigrationLock(async () => "plain")).resolves.toBe("plain");
  });
});
