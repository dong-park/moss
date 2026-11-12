"use client";

import { create } from "zustand";
import {
  type Board,
  type Connection,
  type EmbeddingCacheEntry,
  type Note,
  type Settings,
  type TrashEntry,
  DEFAULT_SETTINGS,
  type MossDB,
  getDB,
} from "@/state/db/schema";
import {
  clearAttachmentsDir,
  clearOpfsPurgePending,
  deleteBlob,
  isOpfsPurgePending,
  quotaUsage,
  type QuotaInfo,
} from "@/state/db/opfs";
import {
  deleteConnectionRecord,
  writeConnectionRecord,
  writeToBoardDoc,
} from "@/state/ydoc/writeThrough";
import {
  deleteConnection as deleteConnectionDoc,
  deleteNote as deleteNoteDoc,
  readConnections as readConnectionsDoc,
  updateNoteField,
} from "@/state/ydoc/model";
import { LOCAL_ORIGIN, UNTRACKED_ORIGIN, type WriteOrigin } from "@/state/ydoc/origin";
import {
  cancelPersist,
  connectionMirrorSettled,
  flushAll,
  persistSettled,
  trackConnectionMirrorWrite,
  trackPersist,
} from "@/state/cardPersist";
import { beginSave } from "./saveFeedback";
import { liveFileRefs } from "@/state/undoFiles";
import {
  SYSTEM_BOARD_ID,
  isSystemBoardNote,
  normalizeBoardId,
} from "@/state/boardIds";

/**
 * n1: 시스템 보드 주소의 메모를 고르는 필터. 마이그레이션 전 레거시 행(boardId=null)도
 * 함께 포함한다 — 중단·재개 경계에서 잠깐 공존할 수 있다.
 */
function systemBoardNoteFilter(db: MossDB) {
  return db.notes.filter(isSystemBoardNote);
}


interface StorageState {
  initialized: boolean;
  settings: Settings | null;
  quota: QuotaInfo | null;

  init: () => Promise<void>;

  loadCards: (boardId: string | null) => Promise<Note[]>;
  /**
   * n23 P2-12: 보드의 기기 로컬 필드(lastVisitedAt)만 id→값으로 읽는다.
   * 카드 본문·좌표는 Y.Doc이 원본이라 Dexie에서 Note 전체를 재구성할 필요가 없다.
   */
  loadLastVisitedAt: (boardId: string | null) => Promise<Record<string, number>>;
  /**
   * FEAT-memo-table-view: 모든 보드의 노트를 한 번에 읽는다. 현재 스토어 `cards`는
   * 현재 보드만 들고 있으므로 표 뷰는 이 별도 쿼리를 쓴다(spec §4 의존). createdAt
   * 오름차순으로 안정 정렬해 돌려준다. Dexie 미러를 읽는다 — 보드 문서를 다 열지 않는다.
   */
  loadAllNotes: () => Promise<Note[]>;
  saveNote: (patch: Partial<Note> & { id: string }) => Promise<Note>;
  /**
   * FEAT-memo-table-view P1-2: 표 인라인 제목 확정 전용. 없는 노트는 만들지 않고
   * (`db.notes.update` — 없으면 no-op), 값이 같으면 updatedAt도 건드리지 않는다.
   * saveNote의 mergeNote가 무변경/없는 노트도 새로 만들며 updatedAt을 올리는 문제 회피.
   * 미러를 고친 뒤 그 노트의 보드 문서에도 쓴다 — 원본은 Y.Doc이다.
   */
  /** opts.origin은 문서 쓰기 origin이다(cmd-z-undo n4: 브리지는 기록 안 하는 origin). */
  updateNoteTitle: (
    id: string,
    title: string | undefined,
    opts?: { origin?: WriteOrigin },
  ) => Promise<void>;
  removeNote: (id: string) => Promise<void>;

  /**
   * FEAT-text-tool: 휴지통을 거치지 않고 즉시 영구 삭제한다(연결선·임베딩 포함,
   * 한 트랜잭션). "빈 텍스트 자동 소멸"처럼 되돌리기 대상이 아닌 행 전용.
   */
  /** opts.origin은 문서 쓰기 origin이다. 불러오기 정리·빈 글상자 지우기는 기록 안 하는 origin을 넘긴다. */
  hardDeleteNotes: (
    ids: string[],
    boardId?: string | null,
    opts?: { origin?: WriteOrigin },
  ) => Promise<void>;

  /**
   * FEAT-trash: 메모를 영구 삭제 대신 휴지통으로 보낸다. 한 트랜잭션에서 연결선·보드
   * 이름을 스냅샷해 `trash`에 넣고 notes·connections·embeddings에서 지운다.
   * OPFS 첨부 blob은 지우지 않는다(복구 가능해야 한다).
   */
  trashNote: (id: string) => Promise<void>;
  /** FEAT-trash: 여러 장을 한 트랜잭션으로 휴지통에 넣는다. */
  trashNotes: (ids: string[]) => Promise<void>;
  /** FEAT-trash: 휴지통 목록 — deletedAt 내림차순(최신순). */
  listTrash: () => Promise<TrashEntry[]>;
  /**
   * FEAT-trash: 휴지통에서 복구. 원래 보드가 있으면 원래 좌표, 없으면 fallback 좌표·
   * boardId에 frameId를 비운다. 같은 보드에 판이 살아 있으면 frameId를 유지한다.
   * 양 끝 메모가 살아 있는 연결선만 다시 넣는다. 복구한 Note를 돌려준다.
   *
   * cmd-z-undo n5: 되돌린 연결선의 문서 쓰기 origin. opts.origin을 주면 그 origin이다(표 보기는
   * 기록 안 하는 origin). opts.currentBoardId를 주면 살릴 보드가 그 보드일 때만 기록하는
   * origin이고, 다른 보드로 살리면 기록 안 하는 origin이다. 둘 다 없으면 지금 문맥 origin이다.
   */
  restoreNote: (
    id: string,
    fallback: { boardId: string | null; x: number; y: number },
    opts?: { origin?: WriteOrigin; currentBoardId?: string | null },
  ) => Promise<Note>;
  /**
   * FEAT-trash: 영구 삭제. ids 생략 시 전체(비우기). 행을 지운 뒤 첨부 blob을 지운다.
   */
  purgeTrash: (ids?: string[]) => Promise<void>;

  loadBoards: () => Promise<Board[]>;
  saveBoard: (patch: Partial<Board> & { id: string }) => Promise<void>;
  removeBoard: (id: string) => Promise<void>;
  /** P1 AC-8: 지운 보드 id를 settings.deletedBoardIds에 남긴다(최근 200개). */
  rememberDeletedBoards: (ids: string[]) => Promise<void>;
  /** P1 AC-8: 휴지통 복원으로 보드가 돌아오면 목록에서 뺀다. */
  forgetDeletedBoards: (ids: string[]) => Promise<void>;
  /** FEAT-subcanvas: boardId별 카드 수 — 함 카드의 "카드 N개" 표시용. */
  countCardsByBoard: (boardIds: string[]) => Promise<Record<string, number>>;
  /**
   * FEAT-subcanvas: 서브 보드 트리 cascade 삭제. rootBoardId와 그 모든
   * 하위 보드(parentBoardId 체인)의 노트·임베딩·연결 DB row를 제거한다.
   * **OPFS 첨부 blob은 여기서 지우지 않는다** — 5초 undo 동안 복원 가능해야 하므로,
   * blob 삭제는 undo 만료 시 [[purgeAttachments]]가 담당한다.
   * @returns 삭제된 row 스냅샷 (undo 시 그대로 re-put).
   */
  removeBoardCascade: (rootBoardId: string) => Promise<{
    boards: Board[];
    notes: Note[];
    connections: Connection[];
    embeddings: EmbeddingCacheEntry[];
  }>;
  /** FEAT-subcanvas: undo 만료/확정 시 노트들의 OPFS 첨부 blob을 실제 삭제. */
  purgeAttachments: (notes: Note[]) => Promise<void>;

  loadConnections: (noteIds?: string[]) => Promise<Connection[]>;
  /** opts.origin은 await 뒤 문서 쓰기까지 넘기는 origin이다(cmd-z-undo n4). */
  saveConnection: (
    patch: Partial<Connection> & { id: string },
    opts?: { origin?: WriteOrigin },
  ) => Promise<void>;
  removeConnection: (id: string, opts?: { origin?: WriteOrigin }) => Promise<void>;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  refreshQuota: () => Promise<QuotaInfo | null>;
}

async function ensureSettings(db: MossDB): Promise<Settings> {
  const existing = await db.settings.get("singleton");
  if (existing) return existing;
  await db.settings.put({ ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

/** P1 AC-8: 지운 보드 id 목록의 최근 보관 상한. 오래된 것부터 밀려난다. */
const DELETED_BOARD_IDS_LIMIT = 200;

/** deletedBoardIds를 덮어쓰고 settings 상태를 갱신한다. */
async function putDeletedBoardIds(db: MossDB, ids: string[]): Promise<Settings> {
  const current = (await db.settings.get("singleton")) ?? { ...DEFAULT_SETTINGS };
  const next: Settings = {
    ...current,
    id: "singleton",
    deletedBoardIds: ids.slice(-DELETED_BOARD_IDS_LIMIT),
  };
  await db.settings.put(next);
  return next;
}

// Serialize a note's mirror transactions, retaining failed fields until a newer
// snapshot/patch actually commits. Retrying a partial patch must not drop an
// earlier failed content edit. The source Y.Doc has its own save channel.
const mirrorQueue = new Map<string, Promise<unknown>>();
const failedMirrorPatch = new Map<string, Partial<Note> & { id: string }>();

function mergeNote(
  prev: Note | undefined,
  patch: Partial<Note> & { id: string },
): Note {
  const now = Date.now();
  if (prev) {
    return { ...prev, ...patch, updatedAt: now };
  }
  return {
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
    ...patch,
  };
}

function mergeBoard(
  prev: Board | undefined,
  patch: Partial<Board> & { id: string },
): Board {
  const now = Date.now();
  if (prev) return { ...prev, ...patch, updatedAt: now };
  return {
    name: "",
    isSystem: false,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ...patch,
  };
}

function mergeConnection(
  prev: Connection | undefined,
  patch: Partial<Connection> & { id: string },
): Connection {
  if (prev) return { ...prev, ...patch };
  return {
    source: "manual",
    status: "active",
    createdAt: Date.now(),
    sourceNoteId: "",
    targetNoteId: "",
    ...patch,
  };
}

/**
 * FEAT-sticky-redesign n3: v5 upgrade가 남긴 "첨부 비우기 대기" 플래그를 DB open
 * 성공 후 한 번만 소비한다. 실패해도 재시도하지 않는다(새 첨부 보호).
 */
async function purgeAttachmentsIfPending(): Promise<void> {
  if (!isOpfsPurgePending()) return;
  // 플래그를 먼저 지운다 — 실패 시 재시도하면 그사이 새로 만든 첨부까지 디렉터리째
  // 지워진다(2단계 재심사 P1). 실패하면 옛 첨부가 고아로 남는 쪽을 택한다.
  clearOpfsPurgePending();
  try {
    await clearAttachmentsDir();
  } catch (err) {
    console.warn("[moss] v5 첨부 비우기 실패 — 옛 첨부가 남을 수 있음", err);
  }
}

async function safeQuota(): Promise<QuotaInfo | null> {
  try {
    return await quotaUsage();
  } catch {
    return null;
  }
}

async function requestPersistIfNeeded(
  db: MossDB,
  settings: Settings,
): Promise<Settings> {
  if (settings.persistGranted !== null) return settings;
  if (typeof navigator === "undefined" || !navigator.storage) return settings;
  if (typeof navigator.storage.persist !== "function") return settings;
  try {
    const granted = await navigator.storage.persist();
    const next = { ...settings, persistGranted: granted };
    await db.settings.put(next);
    return next;
  } catch {
    return settings;
  }
}

export const useStorage = create<StorageState>((set, get) => ({
  initialized: false,
  settings: null,
  quota: null,

  init: async () => {
    if (get().initialized) return;
    const db = getDB();
    await db.open();
    await purgeAttachmentsIfPending();
    let settings = await ensureSettings(db);
    settings = await requestPersistIfNeeded(db, settings);
    const quota = await safeQuota();
    set({ initialized: true, settings, quota });
  },

  loadCards: async (boardId) => {
    const db = getDB();
    const bid = normalizeBoardId(boardId);
    const coll =
      bid === SYSTEM_BOARD_ID
        ? systemBoardNoteFilter(db)
        : db.notes.where("boardId").equals(bid);
    const notes = await coll.toArray();
    notes.sort((a, b) => a.createdAt - b.createdAt);
    return notes;
  },

  loadLastVisitedAt: async (boardId) => {
    const db = getDB();
    const bid = normalizeBoardId(boardId);
    const coll =
      bid === SYSTEM_BOARD_ID
        ? systemBoardNoteFilter(db)
        : db.notes.where("boardId").equals(bid);
    const out: Record<string, number> = {};
    await coll.each((n) => {
      if (typeof n.lastVisitedAt === "number") out[n.id] = n.lastVisitedAt;
    });
    return out;
  },

  loadAllNotes: async () => {
    const db = getDB();
    const notes = await db.notes.toArray();
    notes.sort((a, b) => a.createdAt - b.createdAt);
    return notes;
  },

  saveNote: (patch) => {
    const db = getDB();
    // cmd-z-undo 웨이브 4 리뷰 2바퀴:
    // - W4-8: 메모 미러 쓰기는 모두 여기를 지난다. 진행 중 쓰기를 여기 한 곳에서 등록한다 —
    //   부르는 곳이 어디든 미러 행을 지우는 쪽의 persistSettled가 기다린다.
    // - W4-7: 휴지통이 이긴다. 같은 트랜잭션에서 그 id가 휴지통에 있으면 미러 행을 쓰지 않는다.
    //   다른 탭이 휴지통에 넣은 뒤 끝난 이 탭의 늦은 쓰기가 미러 행을 되살리지 않게 한다.
    //   살리기·다시 나타남·휴지통 빼기는 휴지통 행을 먼저 지우고 미러를 쓴다.
    // - 읽기와 쓰기를 한 트랜잭션에 둔다. 뒤에 연 휴지통 트랜잭션이 그 사이에 끼지 못한다.
    const reserved = patch.boardId !== undefined
      ? beginSave(patch.boardId, `mirror:${patch.id}`, () => get().saveNote(patch)) : null;
    const previous = mirrorQueue.get(patch.id) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      const current = { ...failedMirrorPatch.get(patch.id), ...patch };
      const boardId = current.boardId !== undefined ? current.boardId : (await db.notes.get(patch.id))?.boardId ?? null;
      const ticket = reserved ?? beginSave(boardId, `mirror:${patch.id}`, () => get().saveNote(patch));
      try {
        const result = await db.transaction("rw", [db.notes, db.trash], async () => {
          const prev = await db.notes.get(current.id);
          const next = mergeNote(prev, current);
          if (!(await db.trash.get(current.id))) await db.notes.put(next);
          return next;
        });
        failedMirrorPatch.delete(patch.id);
        ticket.success();
        return result;
      } catch (error) {
        failedMirrorPatch.set(patch.id, current);
        ticket.failure();
        throw error;
      }
    });
    mirrorQueue.set(patch.id, write);
    void write.then(() => {
      if (mirrorQueue.get(patch.id) === write) mirrorQueue.delete(patch.id);
    }, () => {
      if (mirrorQueue.get(patch.id) === write) mirrorQueue.delete(patch.id);
    });
    // 빈번한 saveNote 후마다 quota 호출은 비싸므로 호출자가 refreshQuota를 명시적으로 부른다.
    // n23 P1-5: 정규화된 Note를 돌려준다 — 호출자(브리지)가 Dexie read-back 없이
    // 그대로 Y.Doc에 쓸 수 있게. read-back이 비면 쓰기를 조용히 건너뛰던 경로 제거.
    return trackPersist(patch.id, write);
  },

  updateNoteTitle: async (id, title, opts) => {
    const origin = opts?.origin;
    const db = getDB();
    const prev = await db.notes.get(id);
    if (!prev) return; // 없는 노트는 새로 만들지 않는다(P1-2).
    const next = title || undefined;
    // A retained failed body mirror edit must still be flushed here even when the
    // title itself is unchanged — a title-only success must never mark the shared
    // mirror:<id> resource saved while an earlier body edit is still unwritten.
    if ((prev.title ?? "") === (next ?? "") && !failedMirrorPatch.has(id)) return; // 무변경 — updatedAt 무갱신.
    // Share the serialized mirror channel with saveNote. Commit the title
    // together with any retained failed fields in one transaction, so success on
    // mirror:<id> reflects what was actually written and never covers a lost body.
    const previous = mirrorQueue.get(id) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      const failed = failedMirrorPatch.get(id);
      const boardId = failed?.boardId !== undefined ? failed.boardId : prev.boardId;
      // Retry re-reads the latest retained failed fields, so the body recovery
      // path is preserved and never replaced by a stale title-only retry.
      const ticket = beginSave(boardId ?? null, `mirror:${id}`, () => get().updateNoteTitle(id, title, opts));
      try {
        const updatedAt = Date.now();
        await db.transaction("rw", [db.notes, db.trash], async () => {
          if (await db.trash.get(id)) return; // 휴지통이 이긴다 — 되살리지 않는다.
          const row = await db.notes.get(id);
          if (!row) return; // update(not upsert) 가드 유지.
          await db.notes.put({ ...row, ...failed, title: next, updatedAt });
        });
        // 제목은 원본(Y.Doc)에도 쓴다. 실패했던 본문은 이미 원본에 있으므로(미러 쓰기만
        // 실패) 미러 행에만 되살린다 — 원본을 더 오래된 값으로 덮어쓰지 않는다.
        await writeToBoardDoc(boardId ?? null, (doc) => {
          updateNoteField(doc, id, "title", next, origin);
          updateNoteField(doc, id, "updatedAt", updatedAt, origin);
        });
        failedMirrorPatch.delete(id);
        ticket.success();
      } catch (error) { ticket.failure(); throw error; }
    });
    mirrorQueue.set(id, write);
    void write.then(() => {
      if (mirrorQueue.get(id) === write) mirrorQueue.delete(id);
    }, () => {
      if (mirrorQueue.get(id) === write) mirrorQueue.delete(id);
    });
    await write;
  },

  removeNote: async (id) => {
    // 영구 삭제 = 휴지통에 넣고 바로 비우기. 정리 규칙을 trashNotes 한 곳에 둔다.
    await get().trashNotes([id]);
    await get().purgeTrash([id]);
  },

  hardDeleteNotes: async (ids, boardId, opts) => {
    const origin = opts?.origin;
    if (ids.length === 0) return;
    const db = getDB();
    // cmd-z-undo 웨이브 4 리뷰(W4-5): 이미 시작된 미러 쓰기가 끝난 뒤 지운다 — 늦은 put이 행을 되살린다.
    await persistSettled(ids);
    // 권위 있는 삭제 경계에서 미러 재시도·예약 쓰기를 모두 취소한다. 호출자(브리지)가
    // 비활성 보드 삭제 시 cancelPersist를 거치지 않으므로, 남은 재시도가 영구 삭제된
    // 행을 retryBoardSave에서 되살리지 못하게 여기서 끊는다.
    for (const id of ids) { failedMirrorPatch.delete(id); cancelPersist(id); }
    await connectionMirrorSettled();
    // 원본 문서에서 먼저 지운다. 보드를 모르면 미러 행의 boardId로 찾는다.
    const byBoard = new Map<string | null, string[]>();
    for (const id of ids) {
      const bid =
        boardId !== undefined ? boardId : ((await db.notes.get(id))?.boardId ?? null);
      byBoard.set(bid, [...(byBoard.get(bid) ?? []), id]);
    }
    for (const [bid, noteIds] of byBoard) {
      const gone = new Set(noteIds);
      await writeToBoardDoc(bid, (doc) => {
        for (const c of readConnectionsDoc(doc)) {
          if (gone.has(c.sourceNoteId) || gone.has(c.targetNoteId)) {
            deleteConnectionDoc(doc, c.id, origin);
          }
        }
        for (const id of noteIds) deleteNoteDoc(doc, id, origin);
      });
    }
    await db.transaction(
      "rw",
      [db.notes, db.connections, db.embeddings],
      async () => {
        const incident = await db.connections
          .where("sourceNoteId")
          .anyOf(ids)
          .or("targetNoteId")
          .anyOf(ids)
          .toArray();
        await db.connections.bulkDelete(incident.map((c) => c.id));
        await db.embeddings.bulkDelete(ids);
        await db.notes.bulkDelete(ids);
      },
    );
  },

  trashNote: (id) => get().trashNotes([id]),

  trashNotes: async (ids) => {
    if (ids.length === 0) return;
    // cmd-z-undo 웨이브 4 리뷰(W4-5): 이미 시작된 미러 쓰기가 끝난 뒤 옮긴다. cancelPersist는
    // 타이머만 지워서, 늦은 put이 휴지통에 넣은 메모·연결선의 미러 행을 되살린다.
    await persistSettled(ids);
    // 권위 있는 삭제 경계에서 미러 재시도·예약 쓰기를 모두 취소한다(위 hardDeleteNotes와 동일 이유).
    for (const id of ids) { failedMirrorPatch.delete(id); cancelPersist(id); }
    await connectionMirrorSettled();
    const db = getDB();
    // 읽기까지 한 트랜잭션 안에서 — 연달아 지운 두 메모가 같은 연결선을 서로 놓치지 않게.
    await db.transaction(
      "rw",
      [
        db.notes,
        db.connections,
        db.embeddings,
        db.trash,
        db.trashConnections,
        db.boards,
      ],
      async () => {
        for (const id of ids) {
          const note = await db.notes.get(id);
          if (!note) continue;
          const incident = await db.connections
            .where("sourceNoteId")
            .equals(id)
            .or("targetNoteId")
            .equals(id)
            .toArray();
          const board =
            note.boardId === null
              ? undefined
              : await db.boards.get(note.boardId);
          await db.trash.put({
            id,
            note,
            boardName: board?.name ?? null,
            deletedAt: Date.now(),
          });
          await db.trashConnections.bulkPut(incident);
          await db.connections.bulkDelete(incident.map((c) => c.id));
          await db.embeddings.delete(id);
          await db.notes.delete(id);
        }
      },
    );
  },

  listTrash: async () => {
    const db = getDB();
    return db.trash.orderBy("deletedAt").reverse().toArray();
  },

  restoreNote: async (id, fallback, opts) => {
    const db = getDB();
    let back: Connection[] = [];
    const restored = await db.transaction(
      "rw",
      [db.notes, db.connections, db.trash, db.trashConnections, db.boards],
      async () => {
        const entry = await db.trash.get(id);
        if (!entry) throw new Error(`휴지통에 없는 메모입니다: ${id}`);
        const note = entry.note;
        // 원래 보드가 살아 있으면 원래 자리, 없으면 fallback 자리로.
        let boardId = note.boardId;
        let x = note.x;
        let y = note.y;
        if (boardId !== null && !(await db.boards.get(boardId))) {
          boardId = fallback.boardId;
          x = fallback.x;
          y = fallback.y;
        }
        // 판이 같은 보드에 아직 있으면 frameId 유지, 없으면 비운다(AC-7).
        let frameId = note.frameId;
        if (frameId !== undefined) {
          const frame = await db.notes.get(frameId);
          if (!frame || frame.kind !== "frame" || frame.boardId !== boardId) {
            frameId = undefined;
          }
        }
        const restored: Note = { ...note, boardId, x, y, frameId };
        // cmd-z-undo 웨이브 4 리뷰 2바퀴(W4-7): 휴지통 행을 먼저 지우고 미러를 쓴다.
        await db.trash.delete(id);
        await db.notes.put(restored);
        // 양 끝이 살아 있는 연결선만 되돌린다(AC-8). 반대편이 아직 휴지통이면
        // trashConnections에 그대로 남아 반대편 복구 때 돌아온다.
        const parked = await db.trashConnections
          .where("sourceNoteId")
          .equals(id)
          .or("targetNoteId")
          .equals(id)
          .toArray();
        const others = await db.notes.bulkGet(
          parked.map((c) =>
            c.sourceNoteId === id ? c.targetNoteId : c.sourceNoteId,
          ),
        );
        back = parked.filter((_, i) => others[i]);
        await db.connections.bulkPut(back);
        await db.trashConnections.bulkDelete(back.map((c) => c.id));
        return restored;
      },
    );
    // 되돌린 연결선을 원본 문서에도 쓴다. 소유 문서는 source 메모의 보드다.
    // cmd-z-undo n5(U8·W2): 연결선 쓰기는 반환 전에 나가므로 origin은 여기서 정한다.
    // 다른 보드로 살리면 지금 보드 기록에 단계를 만들지 않는다.
    let origin = opts?.origin;
    if (origin === undefined && opts && "currentBoardId" in opts) {
      origin =
        normalizeBoardId(restored.boardId) === normalizeBoardId(opts.currentBoardId)
          ? LOCAL_ORIGIN
          : UNTRACKED_ORIGIN;
    }
    for (const c of back) await writeConnectionRecord(c, undefined, origin);
    return restored;
  },

  purgeTrash: async (ids) => {
    const db = getDB();
    const entries = await db.transaction(
      "rw",
      db.trash,
      db.trashConnections,
      async () => {
        const found =
          ids === undefined
            ? await db.trash.toArray()
            : (await db.trash.bulkGet(ids)).filter((e): e is TrashEntry => !!e);
        const purged = found.map((e) => e.id);
        await db.trash.bulkDelete(purged);
        // 영구 삭제된 메모에 닿은 연결선은 다시 살아날 일이 없다.
        const dead = await db.trashConnections
          .where("sourceNoteId")
          .anyOf(purged)
          .or("targetNoteId")
          .anyOf(purged)
          .primaryKeys();
        await db.trashConnections.bulkDelete(dead);
        return found;
      },
    );
    // cmd-z-undo n6: 파일 규칙 — 미러 행·열린 보드 문서·남은 휴지통 행·이 탭의 남은 기록 단계
    // 가운데 하나라도 가리키는 사진 파일은 지우지 않는다. 비운 메모를 되돌릴 단계가 남아 있으면
    // 그 단계가 쥔다(비운 뒤 기록 보관). 미러는 예약 쓰기를 먼저 내보낸 뒤 본다.
    const refs = [
      ...new Set(entries.map((e) => e.note.attachmentRef).filter((r): r is string => !!r)),
    ];
    if (refs.length === 0) return;
    await flushAll();
    const live = await liveFileRefs(refs);
    const dead = refs.filter((r) => !live.has(r));
    if (dead.length === 0) return;
    await get().purgeAttachments(dead.map((ref) => ({ attachmentRef: ref }) as Note));
  },

  loadBoards: async () => {
    const db = getDB();
    const boards = await db.boards.toArray();
    boards.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return boards;
  },

  saveBoard: async (patch) => {
    const db = getDB();
    const prev = await db.boards.get(patch.id);
    const next = mergeBoard(prev, patch);
    await db.boards.put(next);
  },

  removeBoard: async (id) => {
    const db = getDB();
    await db.transaction("rw", db.boards, db.notes, async () => {
      // n1: 보드 삭제 후 메모는 시스템 보드로 옮긴다. 이제 그 id는 UUID다.
      await db.notes
        .where("boardId")
        .equals(id)
        .modify({ boardId: SYSTEM_BOARD_ID });
      await db.boards.delete(id);
    });
    // P1 AC-8: 지운 사실을 남겨 `/b/<id>` 재진입이 "찾을 수 없는 보드예요"가 되게 한다.
    await get().rememberDeletedBoards([id]);
  },

  rememberDeletedBoards: async (ids) => {
    if (ids.length === 0) return;
    const db = getDB();
    const current = (await db.settings.get("singleton")) ?? { ...DEFAULT_SETTINGS };
    const drop = new Set(ids);
    const prev = (current.deletedBoardIds ?? []).filter((x) => !drop.has(x));
    const next = await putDeletedBoardIds(db, [...prev, ...ids]);
    set({ settings: next });
  },

  forgetDeletedBoards: async (ids) => {
    if (ids.length === 0) return;
    const db = getDB();
    const current = (await db.settings.get("singleton")) ?? { ...DEFAULT_SETTINGS };
    const drop = new Set(ids);
    const next = await putDeletedBoardIds(
      db,
      (current.deletedBoardIds ?? []).filter((x) => !drop.has(x)),
    );
    set({ settings: next });
  },

  countCardsByBoard: async (boardIds) => {
    const db = getDB();
    const result: Record<string, number> = {};
    await Promise.all(
      boardIds.map(async (id) => {
        result[id] = await db.notes.where("boardId").equals(id).count();
      }),
    );
    return result;
  },

  removeBoardCascade: async (rootBoardId) => {
    const db = getDB();
    // BFS로 삭제 대상 보드 id 수집 (root + 모든 후손). visited-set으로 사이클 방어.
    const toDelete: string[] = [];
    const seen = new Set<string>();
    let frontier = [rootBoardId];
    while (frontier.length > 0) {
      const fresh = frontier.filter((id) => !seen.has(id));
      fresh.forEach((id) => seen.add(id));
      toDelete.push(...fresh);
      const children = (await db.boards
        .where("parentBoardId")
        .anyOf(fresh)
        .primaryKeys()) as string[];
      frontier = children;
    }
    const snapshot = {
      boards: [] as Board[],
      notes: [] as Note[],
      connections: [] as Connection[],
      embeddings: [] as EmbeddingCacheEntry[],
    };
    await db.transaction(
      "rw",
      db.boards,
      db.notes,
      db.connections,
      db.embeddings,
      async () => {
        for (const bid of toDelete) {
          const board = await db.boards.get(bid);
          if (board) snapshot.boards.push(board);
          const notes = await db.notes.where("boardId").equals(bid).toArray();
          if (notes.length > 0) {
            const noteIds = notes.map((n) => n.id);
            const incident = await db.connections
              .where("sourceNoteId")
              .anyOf(noteIds)
              .or("targetNoteId")
              .anyOf(noteIds)
              .toArray();
            const embs = (await db.embeddings.bulkGet(noteIds)).filter(
              (e): e is EmbeddingCacheEntry => !!e,
            );
            snapshot.notes.push(...notes);
            snapshot.connections.push(...incident);
            snapshot.embeddings.push(...embs);
            await db.connections.bulkDelete(incident.map((c) => c.id));
            await db.embeddings.bulkDelete(noteIds);
            await db.notes.bulkDelete(noteIds);
          }
          await db.boards.delete(bid);
        }
      },
    );
    // OPFS blob은 의도적으로 보존 — undo 만료 시 purgeAttachments가 정리.
    // P1 AC-8: 지운 보드(트리 전체) id를 남긴다 — 함 카드 삭제 뒤 주소 재진입 안내.
    await get().rememberDeletedBoards(toDelete);
    return snapshot;
  },

  purgeAttachments: async (notes) => {
    for (const n of notes) {
      if (!n.attachmentRef) continue;
      try {
        await deleteBlob(n.attachmentRef);
      } catch {
        /* ponytail: OPFS 삭제 실패는 무시 — blob은 고아로 남고 자동 재시도는 없다. */
      }
    }
  },

  loadConnections: async (noteIds) => {
    const db = getDB();
    if (!noteIds) return db.connections.toArray();
    const set = new Set(noteIds);
    return db.connections
      .filter((c) => set.has(c.sourceNoteId) || set.has(c.targetNoteId))
      .toArray();
  },

  saveConnection: (patch, opts) => {
    const db = getDB();
    // cmd-z-undo 웨이브 4 리뷰 2바퀴(W4-6): 연결선도 휴지통이 이긴다 — 연결선 휴지통에 있는 선은
    // 미러에 쓰지 않는다. 읽기와 쓰기를 한 트랜잭션에 둔다.
    // 미러와 문서 쓰기 전체를 연결선 미러 쓰기로 등록한다. 휴지통 옮기기가 이 쓰기 뒤에 돈다 —
    // 막 그은 선(connectCards는 await 없이 부른다)의 늦은 문서 쓰기가 휴지통에 옮긴 선을 문서에
    // 되살려 문서와 연결선 휴지통에 함께 두지 않게 한다.
    const write = (async () => {
      const next = await db.transaction("rw", [db.connections, db.trashConnections], async () => {
        const merged = mergeConnection(await db.connections.get(patch.id), patch);
        if (!(await db.trashConnections.get(patch.id))) await db.connections.put(merged);
        return merged;
      });
      // n23 P1-1: 연결선의 Y.Doc 쓰기는 writeThrough 단일 경로(소유=source 메모 보드)만
      // 담당한다. 여기서 활성 문서에 쓰면 활성 보드가 아닌 소유 보드에도 실려 비공개
      // 보드 정보가 공유 문서로 샌다.
      // n23 재심사 2R-6: 저장은 Dexie 미러 + 소유 문서를 storage 한 액션으로 합친다.
      // 소유 보드는 원본 문서의 source 메모에서 판정한다(미러는 locate 힌트일 뿐).
      await writeConnectionRecord(next, undefined, opts?.origin);
    })();
    return trackConnectionMirrorWrite(write);
  },

  removeConnection: async (id, opts) => {
    const db = getDB();
    // cmd-z-undo 웨이브 4 리뷰 2바퀴: saveConnection처럼 읽기와 지우기를 한 트랜잭션에 둔다 —
    // 앞서 연 연결선 저장 트랜잭션 뒤에 차례대로 돈다.
    const conn = await db.transaction("rw", db.connections, async () => {
      const found = await db.connections.get(id);
      await db.connections.delete(id);
      return found;
    });
    // n23 재심사 2R-6: 삭제도 한 액션에서 소유 문서까지 지운다.
    if (conn) await deleteConnectionRecord(id, conn.sourceNoteId, undefined, opts?.origin);
  },

  updateSettings: async (patch) => {
    const db = getDB();
    const current = get().settings ?? (await ensureSettings(db));
    const next: Settings = { ...current, ...patch, id: "singleton" };
    await db.settings.put(next);
    set({ settings: next });
  },

  refreshQuota: async () => {
    const quota = await safeQuota();
    set({ quota });
    return quota;
  },
}));

export type {
  Note,
  Board,
  Connection,
  Settings,
  EmbeddingCacheEntry,
  TrashEntry,
  QuotaInfo,
};
