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
import { SYSTEM_BOARD_ID, isSystemBoardNote, normalizeBoardId } from "../boardIds";

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
    // n1: 레거시 boardId=null은 시스템 보드로 정규화한다. 시스템 보드는 예외 없는
    // UUID id지만, 내보내기 boards.json에는 넣지 않는다 — 가져오기 경계가 시스템
    // id가 든 행을 거부하고, 시스템 보드는 가져온 쪽에서 다시 만들어진다.
    const boardId = normalizeBoardId(opts.boardId);
    if (boardId === SYSTEM_BOARD_ID) {
      notes = await db.notes.filter(isSystemBoardNote).toArray();
      boards = [];
    } else {
      notes = await db.notes.where("boardId").equals(boardId).toArray();
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

  // P0 백업 복원: 시스템 보드 행(isSystem)은 boards.json에 싣지 않는다. 가져오기
  // 경계(validateImportedBoards)가 SYSTEM_BOARD_ID 행을 거부하므로, "all"의 전체
  // toArray()나 "selection"의 bulkGet이 시스템 행을 끌어오면 내보내기→가져오기
  // 왕복이 통째로 실패했다. 시스템 보드는 가져온 쪽에서 다시 만들어진다.
  boards = boards.filter((b) => !b.isSystem);

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
