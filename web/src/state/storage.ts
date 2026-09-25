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

interface StorageState {
  initialized: boolean;
  settings: Settings | null;
  quota: QuotaInfo | null;

  init: () => Promise<void>;

  loadCards: (boardId: string | null) => Promise<Note[]>;
  /**
   * FEAT-memo-table-view: 모든 보드의 노트를 한 번에 읽는다. 현재 스토어 `cards`는
   * 현재 보드만 들고 있으므로 표 뷰는 이 별도 쿼리를 쓴다(spec §4 의존). createdAt
   * 오름차순으로 안정 정렬해 돌려준다.
   */
  loadAllNotes: () => Promise<Note[]>;
  saveNote: (patch: Partial<Note> & { id: string }) => Promise<void>;
  /**
   * FEAT-memo-table-view P1-2: 표 인라인 제목 확정 전용. 없는 노트는 만들지 않고
   * (`db.notes.update` — 없으면 no-op), 값이 같으면 updatedAt도 건드리지 않는다.
   * saveNote의 mergeNote가 무변경/없는 노트도 새로 만들며 updatedAt을 올리는 문제 회피.
   */
  updateNoteTitle: (id: string, title: string | undefined) => Promise<void>;
  removeNote: (id: string) => Promise<void>;

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
   */
  restoreNote: (
    id: string,
    fallback: { boardId: string | null; x: number; y: number },
  ) => Promise<Note>;
  /**
   * FEAT-trash: 영구 삭제. ids 생략 시 전체(비우기). 행을 지운 뒤 첨부 blob을 지운다.
   */
  purgeTrash: (ids?: string[]) => Promise<void>;

  loadBoards: () => Promise<Board[]>;
  saveBoard: (patch: Partial<Board> & { id: string }) => Promise<void>;
  removeBoard: (id: string) => Promise<void>;
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
  saveConnection: (
    patch: Partial<Connection> & { id: string },
  ) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  refreshQuota: () => Promise<QuotaInfo | null>;
}

async function ensureSettings(db: MossDB): Promise<Settings> {
  const existing = await db.settings.get("singleton");
  if (existing) return existing;
  await db.settings.put({ ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

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
    const coll =
      boardId === null
        ? db.notes.filter((n) => n.boardId === null)
        : db.notes.where("boardId").equals(boardId);
    const notes = await coll.toArray();
    notes.sort((a, b) => a.createdAt - b.createdAt);
    return notes;
  },

  loadAllNotes: async () => {
    const db = getDB();
    const notes = await db.notes.toArray();
    notes.sort((a, b) => a.createdAt - b.createdAt);
    return notes;
  },

  saveNote: async (patch) => {
    const db = getDB();
    const prev = await db.notes.get(patch.id);
    const next = mergeNote(prev, patch);
    await db.notes.put(next);
    // 빈번한 saveNote 후마다 quota 호출은 비싸므로 호출자가 refreshQuota를 명시적으로 부른다.
  },

  updateNoteTitle: async (id, title) => {
    const db = getDB();
    const prev = await db.notes.get(id);
    if (!prev) return; // 없는 노트는 새로 만들지 않는다(P1-2).
    const next = title || undefined;
    if ((prev.title ?? "") === (next ?? "")) return; // 무변경 — updatedAt 무갱신.
    await db.notes.update(id, { title: next, updatedAt: Date.now() });
  },

  removeNote: async (id) => {
    // 영구 삭제 = 휴지통에 넣고 바로 비우기. 정리 규칙을 trashNotes 한 곳에 둔다.
    await get().trashNotes([id]);
    await get().purgeTrash([id]);
  },

  trashNote: (id) => get().trashNotes([id]),

  trashNotes: async (ids) => {
    if (ids.length === 0) return;
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

  restoreNote: async (id, fallback) => {
    const db = getDB();
    return db.transaction(
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
        await db.notes.put(restored);
        await db.trash.delete(id);
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
        const back = parked.filter((_, i) => others[i]);
        await db.connections.bulkPut(back);
        await db.trashConnections.bulkDelete(back.map((c) => c.id));
        return restored;
      },
    );
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
    await Promise.all(
      entries.map(async (entry) => {
        const ref = entry.note.attachmentRef;
        if (!ref) return;
        try {
          await deleteBlob(ref);
        } catch {
          /* ponytail: OPFS 삭제 실패는 무시 — blob은 고아로 남고 자동 재시도는 없다. */
        }
      }),
    );
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
      await db.notes.where("boardId").equals(id).modify({ boardId: null });
      await db.boards.delete(id);
    });
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

  saveConnection: async (patch) => {
    const db = getDB();
    const prev = await db.connections.get(patch.id);
    const next = mergeConnection(prev, patch);
    await db.connections.put(next);
  },

  removeConnection: async (id) => {
    await getDB().connections.delete(id);
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
