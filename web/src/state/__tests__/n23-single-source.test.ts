import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB, type Connection, type Note } from "@/state/db/schema";
import {
  getActiveBoardDoc,
  getOrOpenBoardDoc,
  destroyBoardDocs,
  docKeyForBoard,
  __openBoardDocCountForTest,
} from "@/state/ydoc/activeDoc";
import {
  connectionsMap,
  connectionToYMap,
  updateNoteField,
  readNote,
  readNotes,
  readConnections,
  putNote,
} from "@/state/ydoc/model";
import {
  __setInactiveDocTtlForTest,
  INACTIVE_DOC_TTL_MS,
  writeToBoardDoc,
} from "@/state/ydoc/writeThrough";
import { importMossBundle, forEachWithConcurrency, IMPORT_DOC_CONCURRENCY } from "@/state/export/mossBundleImport";
import { CURRENT_SCHEMA_VERSION } from "@/state/export/legacyKinds";
import { dispatchOp } from "@/state/bridge/mossBridge";
import { MIGRATION_VERSION } from "@/state/db/dexieMigration";
import { getSharedSnapshot } from "@/state/ydoc/sharedSnapshot";

/**
 * FEAT-collab-auth n23 — 원본을 Yjs 하나로.
 *
 * 완료 기준 중 이 파일이 맡는 것:
 * - 앱 읽기 경로가 Y.Doc에서 온다(Dexie notes를 비워도 열린다).
 * - merge 가져오기가 이전 완료 버전 상태에서 새로고침 뒤에도 보인다.
 * - MCP 브리지 notes.create가 Y.Doc에 들어간다(AC-16 응답 형식 유지).
 * - 6(a) moveCardBetweenDocs가 원본 Y.Doc에서 읽고 대상 문서를 방송한다.
 * - 6(c)(d) 원격 연결선 반영이 변경 id만 읽고 삭제도 반영하며 Dexie 쓰기는 디바운스.
 */

let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  __setInactiveDocTtlForTest(INACTIVE_DOC_TTL_MS);
  const { flushAll } = await import("@/state/cardPersist");
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
    migrationPending: false,
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function boot() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
}

function makeNote(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "imp-1",
    boardId: null,
    kind: "text",
    x: 1,
    y: 2,
    width: 240,
    rotation: 0,
    content: "가져온 메모",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...overrides,
  };
}

async function makeBundle(notes: unknown[], boards: unknown[] = []): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      version: "1.1",
      exportedAt: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      counts: { notes: notes.length, frames: 0, boards: boards.length, connections: 0, embeddings: 0 },
      scope: "all",
    }),
  );
  zip.file("notes.json", JSON.stringify(notes));
  zip.file("boards.json", JSON.stringify(boards));
  return zip.generateAsync({ type: "blob" });
}

describe("n23 작업 1 — 앱 읽기는 Y.Doc에서 온다", () => {
  it("Dexie notes 테이블을 비워도 보드가 그대로 열린다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 5, 6);
    useWorkspace.getState().setContent(id, "문서가 원본");
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    // 미러 테이블을 비운다 — 읽기가 Dexie에 의존하면 카드가 사라진다.
    await getDB().notes.clear();

    // 새 세션(새로고침) — 스토리지/스토어를 다시 부팅한다.
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], currentBoardId: SYSTEM_BOARD_ID });
    await boot();

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.content).toBe("문서가 원본");
  });
});

describe("n23 작업 3 — 가져오기는 Y.Doc에 직접 쓴다", () => {
  it("merge 가져오기 후 새로고침해도(이전 완료 버전) 가져온 메모가 보인다", async () => {
    await boot();
    // 이전 완료 상태로 만들어 부팅 시 재이전이 의미를 갖지 않게 한다.
    await useStorage.getState().updateSettings({
      dexieMigrationVersion: MIGRATION_VERSION,
      migratedDocs: [],
      migrationFailures: {},
    });

    const blob = await makeBundle([makeNote({ id: "imp-1" }), makeNote({ id: "imp-2", x: 30 })]);
    await importMossBundle(blob, "merge");

    // 새로고침: Dexie가 아니라 Y.Doc에서 읽는다.
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], currentBoardId: SYSTEM_BOARD_ID });
    await boot();

    const ids = useWorkspace.getState().cards.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["imp-1", "imp-2"]));
  });

  it("overwrite 가져오기는 옛 보드 문서 내용을 비운다", async () => {
    await boot();
    const keepId = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setContent(keepId, "옛 메모");

    const blob = await makeBundle([makeNote({ id: "fresh" })]);
    await importMossBundle(blob, "overwrite");

    const doc = getActiveBoardDoc()!.doc;
    expect(readNote(doc, keepId)).toBeUndefined();
    expect(readNote(doc, "fresh")).toBeDefined();
  });
});

describe("n23 작업 3 — MCP 브리지가 Y.Doc에 쓴다", () => {
  it("다른 보드 notes.create가 그 보드 문서에 들어가고 응답 형식이 유지된다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("브리지 대상");
    // 현재 보드를 시스템으로 돌려 대상 보드를 비활성으로 만든다.
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);

    const result = (await dispatchOp("notes.create", {
      boardId,
      content: "브리지가 만든 메모",
      x: 7,
      y: 8,
    })) as { id: string; kind: string; boardId: string };

    expect(result.kind).toBe("text");
    expect(result.boardId).toBe(boardId);

    const handle = getOrOpenBoardDoc(boardId);
    await handle.whenLoaded;
    const note = readNote(handle.doc, result.id);
    expect(note?.content).toBe("브리지가 만든 메모");
  });

  it("현재 보드 notes.create는 활성 문서에 들어간다", async () => {
    await boot();
    const result = (await dispatchOp("notes.create", { content: "현재 보드" })) as {
      id: string;
      kind: string;
    };
    const doc = getActiveBoardDoc()!.doc;
    expect(readNote(doc, result.id)?.content).toBe("현재 보드");
  });
});

describe("n23 작업 6(a) — 크로스보드 이동은 원본 Y.Doc에서 읽는다", () => {
  it("Dexie 미러가 낡아도 문서의 최신 값이 대상 보드로 옮겨진다", async () => {
    await boot();
    // 대상 보드를 먼저 만들고 시스템으로 돌아온다 — 이동 중 원본 문서가 재개방되지 않게.
    const targetBoard = await useWorkspace.getState().createBoard("대상");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);

    const id = useWorkspace.getState().addCardAt("text", 1, 1);
    const systemDoc = getActiveBoardDoc()!.doc;
    // 문서에만 최신 값, Dexie 미러에는 낡은 값 — 어느 쪽을 읽는지로 판정한다.
    updateNoteField(systemDoc, id, "content", "문서 최신");
    await getDB().notes.put({
      id,
      boardId: null,
      kind: "text",
      x: 1,
      y: 1,
      width: 240,
      rotation: 0,
      content: "미러 낡음",
      aiOptOut: false,
      createdAt: 1,
      updatedAt: 1,
      lastVisitedAt: 1,
    });

    await useWorkspace.getState().moveCardToBoard(id, targetBoard);

    const handle = getOrOpenBoardDoc(targetBoard);
    await handle.whenLoaded;
    expect(readNote(handle.doc, id)?.content).toBe("문서 최신");
    // 원본(시스템) 문서에서는 지워졌다.
    expect(readNote(systemDoc, id)).toBeUndefined();
  });
});

describe("n23 작업 6(c)(d) — 원격 연결선 반영은 변경 id만, 삭제도, 디바운스", () => {
  async function remoteSetConn(doc: import("yjs").Doc, conn: Connection): Promise<void> {
    doc.transact(() => connectionsMap(doc).set(conn.id, connectionToYMap(conn)), {
      kind: "remote",
    });
  }

  const conn: Connection = {
    id: "cx-1",
    sourceNoteId: "a",
    targetNoteId: "b",
    source: "manual",
    status: "active",
    createdAt: 1,
  };

  it("원격 추가는 디바운스 뒤 미러에 반영되고, 원격 삭제도 미러에서 지운다", async () => {
    await boot();
    const doc = getActiveBoardDoc()!.doc;

    await remoteSetConn(doc, conn);
    // 디바운스(300ms) 전에는 미러에 없다 — 키 입력마다 전행 쓰기를 합친다는 증거.
    expect(await getDB().connections.get("cx-1")).toBeUndefined();

    await new Promise((r) => setTimeout(r, 350));
    expect(await getDB().connections.get("cx-1")).toBeDefined();

    doc.transact(() => connectionsMap(doc).delete("cx-1"), { kind: "remote" });
    await new Promise((r) => setTimeout(r, 350));
    expect(await getDB().connections.get("cx-1")).toBeUndefined();
  });
});

describe("n23 P1-9 — 비활성 보드 문서는 TTL 동안 열어 두고 재사용한다", () => {
  it("TTL 안이면 두 번째 쓰기가 같은 문서를 재사용한다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("임시");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    expect(__openBoardDocCountForTest()).toBe(1);

    __setInactiveDocTtlForTest(5000);
    await dispatchOp("notes.create", { boardId, content: "첫째" });
    const firstDoc = getOrOpenBoardDoc(boardId).doc;
    // 즉시 닫지 않고 열어 둔다(연속 op 재사용 창).
    expect(__openBoardDocCountForTest()).toBe(2);

    await dispatchOp("notes.create", { boardId, content: "둘째" });
    // 문서 재사용 — 새로 열지 않는다.
    expect(getOrOpenBoardDoc(boardId).doc).toBe(firstDoc);
    expect(__openBoardDocCountForTest()).toBe(2);
  });

  it("TTL이 지나면 닫히고, y-indexeddb에 저장돼 다시 열면 내용이 있다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("임시2");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);

    __setInactiveDocTtlForTest(20);
    await dispatchOp("notes.create", { boardId, content: "x" });
    expect(__openBoardDocCountForTest()).toBe(2);
    await new Promise((r) => setTimeout(r, 60));
    expect(__openBoardDocCountForTest()).toBe(1);

    __setInactiveDocTtlForTest(0); // 다시 열어도 즉시 닫히지 않게 잠시 유지
    const handle = getOrOpenBoardDoc(boardId);
    await handle.whenLoaded;
    expect(readNotes(handle.doc).length).toBeGreaterThan(0);
  });
});

describe("n23 P1-1 — 연결선은 source 메모 보드 문서 하나만 소유한다", () => {
  it("saveConnection은 활성 문서에 쓰지 않는다", async () => {
    await boot();
    await useStorage.getState().saveConnection({
      id: "cx-p1",
      sourceNoteId: "a",
      targetNoteId: "b",
    });
    const doc = getActiveBoardDoc()!.doc;
    expect(readConnections(doc).some((c) => c.id === "cx-p1")).toBe(false);
  });

  it("브리지 connections.create는 source 보드 문서에만 쓴다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("비공개");
    const a = (await dispatchOp("notes.create", { boardId, content: "a" })) as { id: string };
    const b = (await dispatchOp("notes.create", { boardId, content: "b" })) as { id: string };
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);

    const conn = (await dispatchOp("connections.create", {
      sourceNoteId: a.id,
      targetNoteId: b.id,
    })) as { id: string };

    const owner = getOrOpenBoardDoc(boardId);
    await owner.whenLoaded;
    expect(readConnections(owner.doc).some((c) => c.id === conn.id)).toBe(true);
    // 활성(시스템) 문서에는 실리지 않는다 — 비공개 보드 정보가 공유 문서로 새지 않게.
    const active = getActiveBoardDoc()!.doc;
    expect(readConnections(active).some((c) => c.id === conn.id)).toBe(false);
  });
});

describe("n23 P1-2 — 가져오기 notes boardId 검증", () => {
  it("문자열 boardId=system 은 거부한다", async () => {
    const blob = await makeBundle([makeNote({ id: "bad", boardId: SYSTEM_BOARD_ID })]);
    await expect(importMossBundle(blob, "merge")).rejects.toMatchObject({
      reason: "invalid_structure",
    });
  });

  it("문자열이 아닌 boardId 는 거부한다", async () => {
    const blob = await makeBundle([makeNote({ id: "bad", boardId: 42 })]);
    await expect(importMossBundle(blob, "merge")).rejects.toMatchObject({
      reason: "invalid_structure",
    });
  });
});

describe("n23 P1-3 — 활성 보드 overwrite 가져오기는 스토어를 다시 읽는다", () => {
  it("가져오기 뒤 옛 카드가 스토어에 남지 않는다", async () => {
    await boot();
    const oldId = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setContent(oldId, "옛 메모");
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    const blob = await makeBundle([makeNote({ id: "fresh-1" })]);
    await importMossBundle(blob, "overwrite");

    const ids = useWorkspace.getState().cards.map((c) => c.id);
    expect(ids).not.toContain(oldId);
    expect(ids).toContain("fresh-1");
  });
});

describe("n23 P1-6 — 재로드는 현재 보드를 재활성화한다", () => {
  it("loadFromStorage를 다시 불러도 보고 있던 보드가 활성으로 유지된다", async () => {
    await boot();
    await useWorkspace.getState().createBoard("머무는 보드");
    const cardId = useWorkspace.getState().addCardAt("text", 1, 1);
    useWorkspace.getState().setContent(cardId, "보드 카드");
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    // 이전 예산 초과 후 재로드를 흉내낸다 — currentBoardId는 그대로.
    await useWorkspace.getState().loadFromStorage();

    const systemDoc = getOrOpenBoardDoc(null);
    await systemDoc.whenLoaded;
    expect(readNote(systemDoc.doc, cardId)).toBeUndefined();
    expect(useWorkspace.getState().cards.some((c) => c.id === cardId)).toBe(true);
  });
});

describe("n23 P2-11 — 갱신은 바뀐 필드만 문서에 쓴다", () => {
  it("원격이 바꾼 width를 로컬 본문 저장이 덮지 않는다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    const doc = getActiveBoardDoc()!.doc;
    // 원격(다른 탭)이 width를 바꾼 상황 — 스토어 반영 없이 문서만 바뀐 상태.
    updateNoteField(doc, id, "width", 999);

    useWorkspace.getState().setContent(id, "본문 변경");
    const note = readNote(doc, id);
    expect(note?.width).toBe(999);
    expect(note?.content).toBe("본문 변경");
  });
});

describe("n23 P2-13 — 원격 연결선 반영은 bulk로 미러에 쓴다", () => {
  async function remoteSetConn(doc: import("yjs").Doc, conn: Connection): Promise<void> {
    doc.transact(() => connectionsMap(doc).set(conn.id, connectionToYMap(conn)), {
      kind: "remote",
    });
  }

  it("여러 연결선 추가를 한 번의 bulkPut으로 반영한다", async () => {
    await boot();
    const doc = getActiveBoardDoc()!.doc;
    const bulkPut = vi.spyOn(getDB().connections, "bulkPut");

    const make = (id: string): Connection => ({
      id,
      sourceNoteId: "a",
      targetNoteId: "b",
      source: "manual",
      status: "active",
      createdAt: 1,
    });
    await remoteSetConn(doc, make("cx-b1"));
    await remoteSetConn(doc, make("cx-b2"));
    await new Promise((r) => setTimeout(r, 350));

    expect(bulkPut).toHaveBeenCalledTimes(1);
    expect(await getDB().connections.get("cx-b1")).toBeDefined();
    expect(await getDB().connections.get("cx-b2")).toBeDefined();
  });
});

describe("n23 P1-5 — 브리지는 read-back 없이 정규화된 Note를 문서에 쓴다", () => {
  it("Dexie read-back이 비어도 Y.Doc에 메모가 들어간다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("대상");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);

    const getSpy = vi.spyOn(getDB().notes, "get").mockResolvedValue(undefined);
    const result = (await dispatchOp("notes.create", {
      boardId,
      content: "read-back 없이",
    })) as { id: string };
    getSpy.mockRestore();

    const handle = getOrOpenBoardDoc(boardId);
    await handle.whenLoaded;
    expect(readNote(handle.doc, result.id)?.content).toBe("read-back 없이");
  });
});

describe("n23 P1-8 — 대상 문서 로드 성공 뒤에야 원본에서 지운다", () => {
  it("대상 문서 열기가 실패하면 원본 메모를 지우지 않는다", async () => {
    await boot();
    const target = await useWorkspace.getState().createBoard("대상");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    const cardId = useWorkspace.getState().addCardAt("text", 1, 1);
    useWorkspace.getState().setContent(cardId, "지켜야 함");
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    const targetHandle = getOrOpenBoardDoc(target);
    await targetHandle.whenLoaded;
    const failing = Promise.reject(new Error("대상 열기 실패"));
    void failing.catch(() => {}); // 즉시 핸들 부착 — await 전 unhandled 방지
    (targetHandle as { whenLoaded: Promise<void> }).whenLoaded = failing;

    await expect(
      useWorkspace.getState().moveCardToBoard(cardId, target),
    ).rejects.toThrow("대상 열기 실패");

    const systemDoc = getOrOpenBoardDoc(null);
    await systemDoc.whenLoaded;
    expect(readNote(systemDoc.doc, cardId)).toBeDefined();
  });
});

describe("n23 P1-10 — 가져오기 문서 열기는 동시 4개로 제한한다", () => {
  it("forEachWithConcurrency는 limit을 넘지 않고 최대치를 채운다", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await forEachWithConcurrency(items, IMPORT_DOC_CONCURRENCY, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBe(IMPORT_DOC_CONCURRENCY);
    expect(peak).toBeLessThanOrEqual(IMPORT_DOC_CONCURRENCY);
  });
});

describe("n23 재심사 2R-1 — 이전 중 보드 전환 차단", () => {
  it("migrationPending 이면 setCurrentBoard·createBoard 가 조기 반환한다", async () => {
    await boot();
    await useWorkspace.getState().createBoard("기존");
    const before = useWorkspace.getState().currentBoardId;

    useWorkspace.setState({ migrationPending: true });
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().currentBoardId).toBe(before);

    const created = await useWorkspace.getState().createBoard("막힌 보드");
    expect(created).toBe(before);
    expect(useWorkspace.getState().boards.some((b) => b.name === "막힌 보드")).toBe(false);
  });
});

describe("n23 재심사 2R-2 — 문서 쓰기 경로가 공유 스냅샷을 갱신·정리한다", () => {
  it("commitMove 가 바뀐 좌표로 스냅샷을 갱신한다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    useWorkspace.setState((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, x: 100, y: 50 } : c)),
    }));
    useWorkspace.getState().commitMove([id]);

    const snap = getSharedSnapshot(id);
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBe(50);
  });

  it("메모 삭제는 공유 스냅샷을 버린다", async () => {
    await boot();
    const id = useWorkspace.getState().addCardAt("text", 1, 1);
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();
    expect(getSharedSnapshot(id)).toBeDefined();

    useWorkspace.getState().remove(id);
    expect(getSharedSnapshot(id)).toBeUndefined();
  });
});

describe("n23 재심사 2R-3 — 소스 문서 로드 실패 핸들을 버린다", () => {
  it("소스 whenLoaded 실패 시 캐시에서 버리고 실패시킨다", async () => {
    await boot();
    const target = await useWorkspace.getState().createBoard("대상");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    const id = useWorkspace.getState().addCardAt("text", 1, 1);
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    const systemHandle = getOrOpenBoardDoc(null);
    await systemHandle.whenLoaded;
    const failing = Promise.reject(new Error("소스 열기 실패"));
    void failing.catch(() => {});
    (systemHandle as { whenLoaded: Promise<void> }).whenLoaded = failing;

    await expect(
      useWorkspace.getState().moveCardToBoard(id, target),
    ).rejects.toThrow("소스 열기 실패");

    // 실패한 핸들은 캐시에서 사라져 재시도가 새 핸들을 연다.
    expect(getOrOpenBoardDoc(null)).not.toBe(systemHandle);
  });
});

describe("n23 재심사 2R-4 — closeNow 는 TTL 없이 쓰기 직후 닫는다", () => {
  it("closeNow 쓰기는 문서를 열어 두지 않는다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("임시");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    __setInactiveDocTtlForTest(5000);
    const before = __openBoardDocCountForTest();

    await writeToBoardDoc(
      boardId,
      (doc) => putNote(doc, makeNote({ id: "close-now", boardId }) as Note),
      { closeNow: true },
    );

    expect(__openBoardDocCountForTest()).toBe(before);
  });
});

describe("n23 재심사 2R-5 — overwrite 재로드·merge boardId 검증", () => {
  it("overwrite 는 활성 보드가 번들에 없어도 스토어를 재로드한다", async () => {
    await boot();
    await useWorkspace.getState().createBoard("옛 보드"); // 활성 = 옛 보드
    const oldId = useWorkspace.getState().addCardAt("text", 1, 1);
    useWorkspace.getState().setContent(oldId, "옛 카드");
    const { flushAll } = await import("@/state/cardPersist");
    await flushAll();

    // 번들에는 시스템 메모만 — 옛 보드는 사라진다.
    const blob = await makeBundle([makeNote({ id: "new-note" })]);
    await importMossBundle(blob, "overwrite");

    expect(useWorkspace.getState().cards.map((c) => c.id)).not.toContain(oldId);
  });

  it("merge 의 note.boardId 가 허용 집합 밖이면 거부한다", async () => {
    await boot();
    const blob = await makeBundle([makeNote({ id: "ghost-note", boardId: "ghost" })]);
    await expect(importMossBundle(blob, "merge")).rejects.toMatchObject({
      reason: "invalid_structure",
    });
  });

  it("빈 문자열 boardId 를 거부한다", async () => {
    const blob = await makeBundle([makeNote({ id: "empty-note", boardId: "" })]);
    await expect(importMossBundle(blob, "merge")).rejects.toMatchObject({
      reason: "invalid_structure",
    });
  });
});

describe("n23 재심사 2R-6 — 연결선 저장/삭제는 storage 한 액션", () => {
  it("saveConnection·removeConnection 이 소유 문서를 함께 쓴다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("소유 보드");
    const a = (await dispatchOp("notes.create", { boardId, content: "a" })) as { id: string };
    const b = (await dispatchOp("notes.create", { boardId, content: "b" })) as { id: string };
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);

    await useStorage.getState().saveConnection({
      id: "cx-2r6",
      sourceNoteId: a.id,
      targetNoteId: b.id,
    });
    const owner = getOrOpenBoardDoc(boardId);
    await owner.whenLoaded;
    expect(readConnections(owner.doc).some((c) => c.id === "cx-2r6")).toBe(true);

    await useStorage.getState().removeConnection("cx-2r6");
    expect(readConnections(owner.doc).some((c) => c.id === "cx-2r6")).toBe(false);
  });
});

describe("n23 재심사 2R-7 — 문서 키 total 매핑·비활성 close 타이머 소유", () => {
  it("docKeyForBoard 는 total 매핑이다(SYSTEM 문자열도 통과)", () => {
    expect(docKeyForBoard(null)).toBe(SYSTEM_BOARD_ID);
    expect(docKeyForBoard("system")).toBe("system");
    expect(docKeyForBoard("b1")).toBe("b1");
  });

  it("재오픈하면 예약된 close 가 취소된다", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("임시");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    const base = __openBoardDocCountForTest();

    __setInactiveDocTtlForTest(50);
    await writeToBoardDoc(boardId, (doc) =>
      putNote(doc, makeNote({ id: "ttl-note", boardId }) as Note),
    );
    expect(__openBoardDocCountForTest()).toBe(base + 1);

    // 재오픈 — 예약된 close를 취소하므로 TTL이 지나도 닫히지 않는다.
    getOrOpenBoardDoc(boardId);
    await new Promise((r) => setTimeout(r, 90));
    expect(__openBoardDocCountForTest()).toBe(base + 1);
  });
});
