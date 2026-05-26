"use client";

import { create } from "zustand";
import {
  type Board,
  type Connection,
  type EmbeddingCacheEntry,
  type Note,
  type Settings,
  DEFAULT_SETTINGS,
  type MossDB,
  getDB,
} from "@/state/db/schema";
import { deleteBlob, quotaUsage, type QuotaInfo } from "@/state/db/opfs";

interface StorageState {
  initialized: boolean;
  settings: Settings | null;
  quota: QuotaInfo | null;

  init: () => Promise<void>;

  loadCards: (boardId: string | null) => Promise<Note[]>;
  saveNote: (patch: Partial<Note> & { id: string }) => Promise<void>;
  removeNote: (id: string) => Promise<void>;

  loadBoards: () => Promise<Board[]>;
  saveBoard: (patch: Partial<Board> & { id: string }) => Promise<void>;
  removeBoard: (id: string) => Promise<void>;

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

function mergeNote(prev: Note | undefined, patch: Partial<Note> & { id: string }): Note {
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

function mergeBoard(prev: Board | undefined, patch: Partial<Board> & { id: string }): Board {
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

  saveNote: async (patch) => {
    const db = getDB();
    const prev = await db.notes.get(patch.id);
    const next = mergeNote(prev, patch);
    await db.notes.put(next);
    // 빈번한 saveNote 후마다 quota 호출은 비싸므로 호출자가 refreshQuota를 명시적으로 부른다.
  },

  removeNote: async (id) => {
    const db = getDB();
    const note = await db.notes.get(id);
    const attachmentRef = note?.attachmentRef;
    await db.transaction("rw", db.notes, db.connections, db.embeddings, async () => {
      const incidentIds = await db.connections
        .where("sourceNoteId")
        .equals(id)
        .or("targetNoteId")
        .equals(id)
        .primaryKeys();
      await db.connections.bulkDelete(incidentIds);
      await db.embeddings.delete(id);
      await db.notes.delete(id);
    });
    if (attachmentRef) {
      try {
        await deleteBlob(attachmentRef);
      } catch {
        /* OPFS 삭제 실패는 무시 — 다음 GC에서 다시 시도 가능 */
      }
    }
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

export type { Note, Board, Connection, Settings, EmbeddingCacheEntry, QuotaInfo };
