import {
  DEFAULT_SETTINGS,
  getDB,
  type Board,
  type Connection,
  type EmbeddingCacheEntry,
  type Note,
  type Settings,
} from "../db/schema";
import type { ExportScope } from "./types";

export interface CollectedExportData {
  notes: Note[];
  boards: Board[];
  connections: Connection[];
  embeddings: EmbeddingCacheEntry[];
  settings: Settings;
}

/** scope에 맞게 DB에서 내보낼 데이터를 수집한다. */
export async function collectExportData(opts: {
  scope: ExportScope;
  boardId?: string;
  noteIds?: string[];
}): Promise<CollectedExportData> {
  const db = getDB();
  await db.open();

  let notes: Note[];
  let boards: Board[];

  if (opts.scope === "all") {
    notes = await db.notes.toArray();
    boards = await db.boards.toArray();
  } else if (opts.scope === "board") {
    const boardId = opts.boardId ?? null;
    notes =
      boardId === null
        ? await db.notes.filter((n) => n.boardId === null).toArray()
        : await db.notes.where("boardId").equals(boardId).toArray();
    if (boardId === null) {
      boards = [];
    } else {
      const board = await db.boards.get(boardId);
      boards = board ? [board] : [];
    }
  } else {
    const ids = new Set(opts.noteIds ?? []);
    notes = ids.size > 0 ? (await db.notes.bulkGet([...ids])).filter((n): n is Note => !!n) : [];
    const boardIdSet = new Set(notes.map((n) => n.boardId).filter((b): b is string => !!b));
    boards =
      boardIdSet.size > 0
        ? (await db.boards.bulkGet([...boardIdSet])).filter((b): b is Board => !!b)
        : [];
  }

  const noteIds = new Set(notes.map((n) => n.id));
  const allConnections = await db.connections.toArray();
  const connections = allConnections.filter(
    (c) => noteIds.has(c.sourceNoteId) && noteIds.has(c.targetNoteId),
  );

  const embeddings = (
    await db.embeddings.bulkGet([...noteIds])
  ).filter((e): e is EmbeddingCacheEntry => !!e);

  const settings = (await db.settings.get("singleton")) ?? { ...DEFAULT_SETTINGS };

  return { notes, boards, connections, embeddings, settings };
}
