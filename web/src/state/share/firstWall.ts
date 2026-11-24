"use client";

/**
 * local-promise n5 (T15) — 첫 벽 공유.
 *
 * 첫 벽은 시스템 보드다. 모든 기기가 같은 고정 UUID를 쓰므로 그대로 서버에 올리면 다른 사람의
 * 첫 벽과 행이 겹친다. 그래서 공유하는 순간 같은 내용을 새 id의 새 벽으로 옮겨 그 벽을 공유하고,
 * 첫 벽은 이 기기에만 남는다.
 *
 * 순서: 로그인 확인 → 새 벽 만들기 → 메모·연결선·파일함 옮기기 → 새 벽 공유 시작 → 새 벽으로 이동.
 * 로그인을 가장 먼저 받아 실패하면 아무것도 건드리지 않는다. 공유가 실패하면 옮긴 것을 되돌리고
 * 새 벽을 지운다 — 내용은 첫 벽에 그대로 있다.
 *
 * "복사 후 비움" 대신 "옮기고 되돌림"을 고른 이유: 복사는 메모 id를 새로 매겨야 해서 판·연결선·함
 * 참조를 전부 다시 이어야 하고, 같은 첨부 파일을 두 메모가 가리키게 된다. 옮기기는 같은 id를
 * 그대로 두므로 어느 순간에 끊겨도 메모는 둘 중 한 보드에 한 벌로 남는다.
 */
import type { Board, Connection, Note, WallStroke } from "@/state/db/schema";
import { getDB } from "@/state/db/schema";
import { SYSTEM_BOARD_ID, isSystemBoardNote, newBoardId } from "@/state/boardIds";
import { flushAll } from "@/state/cardPersist";
import { useStorage } from "@/state/storage";
import { blockWallInput } from "@/state/marker/inputGate";
import { deleteBoardDoc, discardBoardDocByKey, docKeyForBoard, getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import {
  applyStrokeChanges,
  deleteConnection,
  deleteNote,
  putConnection,
  putNote,
  readConnections,
  readNotes,
  readStrokes,
  toSharedNote,
} from "@/state/ydoc/model";
import { forgetSharedSnapshot, setSharedSnapshot } from "@/state/ydoc/sharedSnapshot";
import { writeBoardRecord, writeToBoardDoc } from "@/state/ydoc/writeThrough";
import { decodeSubcanvasRef, useWorkspace } from "@/state/workspace";
import {
  ShareStartError,
  assertDeviceOwner,
  cleanupStaleServerRows,
  ensureShareSession,
  useShare,
  type ShareLeftover,
} from "./store";
import { acquireShareStartLock } from "./startLock";

/** 함 카드가 가리키는 보드 id. 함 카드가 아니거나 content가 손상됐으면 undefined. */
function boardRefOf(note: Pick<Note, "kind" | "content">): string | undefined {
  return note.kind === "board" ? decodeSubcanvasRef(note.content) : undefined;
}

/** 첫 벽에서 새 벽으로 옮길 것. */
export interface FirstWallPlan {
  notes: Note[];
  connections: Connection[];
  /** wall-marker n1: 첫 벽에 그은 마카 획. 메모와 함께 새 벽으로 간다(획 id는 그대로, 보드만 바뀐다). */
  strokes: WallStroke[];
  /** 부모를 첫 벽에서 새 벽으로 바꿀 파일함 보드 id. */
  childBoardIds: string[];
  /** 새 벽 이름 — 첫 벽 제목이 있으면 그 제목, 없으면 빈 문자열(= 이름 없는 보드). */
  name: string;
}

/**
 * 첫 벽에서 무엇이 새 벽으로 가는지 정한다. 읽기만 한다.
 *
 * 남는 것: 다른 사람이 공유한 벽(`remote`)의 입구 카드와 이미 공유 중인 보드를 가리키는 카드.
 * 이 기기의 포인터이거나 이미 서버에 있는 보드의 자리라서 새 벽으로 옮기면 안 된다.
 * 원본은 보드 문서이고 Dexie는 미러다 — 문서에 없는 옛 행은 미러로 채운다.
 */
export async function planFirstWallMove(): Promise<FirstWallPlan> {
  const storage = useStorage.getState();
  if (!storage.initialized) await storage.init();
  const db = getDB();

  const handle = getOrOpenBoardDoc(SYSTEM_BOARD_ID);
  try {
    await handle.whenLoaded;
  } catch (err) {
    discardBoardDocByKey(docKeyForBoard(SYSTEM_BOARD_ID));
    throw err;
  }

  const mirror = new Map<string, Note>();
  for (const row of await db.notes.filter(isSystemBoardNote).toArray()) mirror.set(row.id, row);
  const byId = new Map<string, Note>();
  for (const shared of readNotes(handle.doc)) {
    const local = mirror.get(shared.id);
    byId.set(shared.id, {
      ...local,
      ...shared,
      lastVisitedAt: local?.lastVisitedAt ?? shared.updatedAt,
    });
  }
  for (const [id, row] of mirror) if (!byId.has(id)) byId.set(id, row);

  const boards = await storage.loadBoards();
  const boardById = new Map(boards.map((b) => [b.id, b] as const));
  const shareByBoard = useShare.getState().byBoard;

  const notes: Note[] = [];
  const childBoardIds: string[] = [];
  for (const note of byId.values()) {
    const ref = boardRefOf(note);
    if (ref) {
      const child = boardById.get(ref);
      if (child?.remote || shareByBoard[ref]?.status === "shared") continue;
      if (child && child.parentBoardId === SYSTEM_BOARD_ID) childBoardIds.push(ref);
    }
    notes.push(note);
  }

  // 연결선은 양 끝이 모두 옮겨지는 것만 함께 간다. 한쪽이 남으면 첫 벽에 그대로 둔다 — 화면은
  // 양 끝이 현재 카드일 때만 그리므로 남은 선은 보이지 않는다.
  const moved = new Set(notes.map((n) => n.id));
  const connections = new Map<string, Connection>();
  for (const c of readConnections(handle.doc)) connections.set(c.id, c);
  for (const c of await db.connections.toArray()) if (!connections.has(c.id)) connections.set(c.id, c);
  const wholeConnections = [...connections.values()].filter(
    (c) => moved.has(c.sourceNoteId) && moved.has(c.targetNoteId),
  );

  // 벽 획은 메모와 달리 서로 이어진 것이 없어 전부 간다. 원본은 문서 하나뿐이다(로컬 미러 없음).
  const strokes = readStrokes(handle.doc);

  const first = boardById.get(SYSTEM_BOARD_ID);
  return {
    notes,
    connections: wholeConnections,
    strokes,
    childBoardIds: [...new Set(childBoardIds)],
    name: first?.name?.trim() ?? "",
  };
}

/** 메모·연결선·벽 획을 `from` 보드에서 `to` 보드로 옮긴다. 대상에 먼저 쓰고 원본에서 지운다. */
async function moveContents(plan: FirstWallPlan, fromId: string, toId: string): Promise<void> {
  if (plan.notes.length === 0 && plan.connections.length === 0 && plan.strokes.length === 0) return;
  const moved: Note[] = plan.notes.map((n) => ({ ...n, boardId: toId }));
  const movedStrokes: WallStroke[] = plan.strokes.map((st) => ({ ...st, boardId: toId }));

  // 메모는 미러 먼저 — 문서 쓰기가 끊겨도 메모는 둘 중 한 보드에 남는다. 벽 획은 문서만 있다.
  const db = getDB();
  await db.notes.bulkPut(moved);

  await writeToBoardDoc(toId, (doc) => {
    for (const note of moved) putNote(doc, note);
    for (const c of plan.connections) putConnection(doc, c);
    applyStrokeChanges(doc, { put: movedStrokes });
  });
  await writeToBoardDoc(fromId, (doc) => {
    for (const c of plan.connections) deleteConnection(doc, c.id);
    for (const note of plan.notes) deleteNote(doc, note.id);
    applyStrokeChanges(doc, { remove: plan.strokes.map((st) => st.id) });
  });
  for (const note of moved) {
    forgetSharedSnapshot(note.id);
    setSharedSnapshot(note.id, toSharedNote(note));
  }
}

/** 파일함 보드의 부모를 바꾸고 그 보드 문서의 메타도 맞춘다. */
async function reparentChildren(childIds: string[], parentId: string): Promise<void> {
  if (childIds.length === 0) return;
  const storage = useStorage.getState();
  for (const id of childIds) await storage.saveBoard({ id, parentBoardId: parentId });
  const boards = await storage.loadBoards();
  for (const id of childIds) {
    const board = boards.find((b) => b.id === id);
    if (board) await writeBoardRecord(board);
  }
}

async function refreshBoards(): Promise<void> {
  const boards = await useStorage.getState().loadBoards();
  useWorkspace.setState({ boards });
}

/**
 * 옮기기를 되돌리고 새 벽을 지운다. 내용을 첫 벽에 되돌리지 못하면 새 벽은 지우지 않는다 —
 * 내용이 거기 있다. 되돌리기를 끝까지 마쳤는지 돌려준다.
 */
async function rollback(plan: FirstWallPlan, newId: string): Promise<boolean> {
  // 되돌리는 동안에도 벽 획 입력을 받지 않는다(옮기는 쪽이 읽은 목록과 어긋나지 않게).
  const release = blockWallInput();
  try {
    return await rollbackBlocked(plan, newId);
  } finally {
    release();
  }
}

async function rollbackBlocked(plan: FirstWallPlan, newId: string): Promise<boolean> {
  try {
    await moveContents(plan, newId, SYSTEM_BOARD_ID);
    await reparentChildren(plan.childBoardIds, SYSTEM_BOARD_ID);
  } catch {
    return false;
  }
  try {
    await useStorage.getState().removeBoard(newId);
    await deleteBoardDoc(newId);
  } catch {
    /* 지우지 못한 빈 벽은 남는다 — 내용은 이미 첫 벽에 돌아와 있다 */
  }
  useShare.getState().forgetBoard(newId);
  try {
    await refreshBoards();
  } catch {
    /* 목록은 다음 갱신에 맞춰진다 */
  }
  return true;
}

/** 되돌리지 못했으면 내용이 있는 새 벽 id를 오류에 싣는다. 시트가 그 벽으로 가는 길을 준다. */
function notRestored(restored: boolean, newId: string): ShareLeftover {
  return restored ? {} : { contentNotRestored: true, contentBoardId: newId };
}

let running: Promise<string> | null = null;

/**
 * 탭 사이에서 첫 벽 공유를 한 번에 하나로 묶는 락 키. 새 벽 id는 탭마다 새로 만들어져서 벽별
 * 시작 락(`startShare`)이 두 탭을 겹쳐 주지 못한다 — 두 탭이 같은 메모를 서버 벽 두 개에 올리고,
 * 실패한 쪽의 되돌리기가 다른 쪽이 옮긴 내용을 되돌린다. 그래서 첫 벽 자체에 고정 키를 쓴다.
 */
const FIRST_WALL_LOCK_KEY = "first-wall";

/**
 * 첫 벽을 새 벽으로 옮겨 공유한다. 서버가 받은 뒤 새 벽 id를 돌려주고, 그 벽으로 이동해 둔다.
 * 실패하면 `ShareStartError`를 던지고 첫 벽은 손대기 전 그대로다. 이미 진행 중이면 같은 결과를 기다린다.
 * 다른 탭이 첫 벽을 공유하는 중이면 아무것도 건드리지 않고 `elsewhere` 이유로 멈춘다.
 */
export function shareFirstWall(): Promise<string> {
  if (running) return running;
  running = runLocked().finally(() => {
    running = null;
  });
  return running;
}

async function runLocked(): Promise<string> {
  const lock = acquireShareStartLock(FIRST_WALL_LOCK_KEY);
  if (!lock) {
    throw new ShareStartError("elsewhere", new Error("다른 창에서 첫 벽을 공유하는 중이에요"));
  }
  // 락을 얻은 뒤에는 이 try 밖에서 던지는 길이 없다 — 락과 heartbeat 가 새지 않는다.
  try {
    return await run();
  } finally {
    lock.release();
  }
}

async function run(): Promise<string> {
  // 1. 로그인 — 실패하면 벽도 서버도 건드리지 않는다.
  let session;
  try {
    session = await ensureShareSession(true);
  } catch (err) {
    throw new ShareStartError("login", err);
  }
  // 다른 계정의 첫 벽이면 옮기기 전에 멈춘다 — `account` 이유로 던진다.
  await assertDeviceOwner(session);
  // 지난 시도가 남긴 서버 행을 먼저 정리한다. 이번 공유는 새 id를 쓰므로 못 지워도 막지 않는다.
  await cleanupStaleServerRows(session).catch(() => []);

  // 2. 대기 중인 카드 저장을 먼저 비운다 — 옮긴 뒤에 옛 보드로 다시 쓰이지 않게.
  //    읽기(plan)부터 옮기기 끝까지 벽 획 입력을 받지 않는다 — 읽은 뒤에 그은 획이 첫 벽에 남지 않게.
  const unblock = blockWallInput();
  let plan: FirstWallPlan;
  try {
    await flushAll();
    plan = await planFirstWallMove();
  } catch (err) {
    unblock();
    throw err;
  }

  // 3. 새 벽을 만든다.
  const storage = useStorage.getState();
  const newId = newBoardId();
  let created = false;
  try {
    await storage.saveBoard({ id: newId, name: plan.name, isSystem: false });
    created = true;
    const board = (await storage.loadBoards()).find((b) => b.id === newId) as Board;
    await writeBoardRecord(board);
    await refreshBoards();

    // 4. 내용을 옮긴다. 파일함 부모를 먼저 바꿔 둬야 공유가 시작될 때 함께 올라간다.
    await moveContents(plan, SYSTEM_BOARD_ID, newId);
    await reparentChildren(plan.childBoardIds, newId);
  } catch (err) {
    const restored = created ? await rollback(plan, newId) : true;
    unblock();
    throw new ShareStartError("share", err, notRestored(restored, newId));
  }
  unblock();

  // 5. 새 벽을 공유한다. 로그인은 위에서 끝났다.
  try {
    await useShare.getState().startShare(newId, plan.name, { login: true });
    if (useShare.getState().byBoard[newId]?.status !== "shared") {
      throw new Error("공유가 시작되지 않았어요");
    }
  } catch (err) {
    const restored = await rollback(plan, newId);
    if (err instanceof ShareStartError) {
      if (restored) throw err;
      throw new ShareStartError(err.reason, err, {
        serverRowLeft: err.serverRowLeft,
        contentUnconfirmed: err.contentUnconfirmed,
        ...notRestored(false, newId),
      });
    }
    throw new ShareStartError("share", err, notRestored(restored, newId));
  }

  // 6. 새 벽으로 이동한다. 첫 벽은 비어 이 기기에 남는다.
  await useWorkspace.getState().navigateToBoard(newId);
  return newId;
}
