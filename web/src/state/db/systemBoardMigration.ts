import {
  DEFAULT_SETTINGS,
  getDB,
  type Board,
  type MossDB,
  type Settings,
} from "./schema";
import { SYSTEM_BOARD_ID } from "../boardIds";
import { openBoardDoc, type BoardDocHandle } from "../ydoc/doc";
import {
  putBoard,
  putConnection,
  putNote,
  readConnections,
  readNotes,
} from "../ydoc/model";
import { transactLocal } from "../ydoc/origin";

/**
 * FEAT-onboarding-routes n1 — 시스템 보드를 UUID id의 평범한 보드 행으로 이전.
 *
 * 이전 전 상태:
 * - Dexie `boards`에 시스템 보드 행이 없다. 시스템 보드 메모는 `boardId === null`.
 * - Yjs 문서 키는 `moss-board-system` (`boardDocName("system")`).
 *
 * 이전 후 상태:
 * - `boards`에 `{ id: SYSTEM_BOARD_ID, isSystem: true }` 행이 있다.
 * - 시스템 보드 메모의 boardId는 SYSTEM_BOARD_ID(UUID).
 * - Yjs 내용은 `moss-board-<uuid>` 문서로 옮겨진다.
 *
 * 멱등: 중간에 끊겨 다시 돌아도 같은 id로 같은 결과가 나온다. `settings.systemBoardMigratedAt`
 * 이 찍히면 이후 부팅은 스킵한다. 옛 문서 키는 되돌리기용 백업으로 남긴다(P1).
 */
export const LEGACY_SYSTEM_DOC_KEY = "system";

export interface SystemBoardMigrationResult {
  /** 이번 실행에서 실제로 이전을 수행했는가(이미 완료면 false). */
  migrated: boolean;
  boardId: string;
  /** 새 id로 옮긴 Dexie 메모 행 수. */
  movedNotes: number;
}

/** 시스템 보드 행을 보장한다(멱등). 기존 이름·시각은 보존한다. */
function ensureSystemBoardRow(existing: Board | undefined): Board {
  const now = Date.now();
  return {
    id: SYSTEM_BOARD_ID,
    name: existing?.name ?? "",
    isSystem: true,
    parentBoardId: existing?.parentBoardId ?? null,
    templateId: existing?.templateId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
    // P1: 새로 만들 때 lastOpenedAt을 now로 채우면, RootBoardRedirect(boards[0],
    // lastOpenedAt desc)가 기존 사용자를 시스템 보드로 보낸다(AC-7 위반). 0이면
    // 방문 시각이 있는 기존 사용자 보드 뒤로 밀려 마지막 보드가 그대로 열린다.
    lastOpenedAt: existing?.lastOpenedAt ?? 0,
  };
}

async function destroyQuietly(handle: BoardDocHandle): Promise<void> {
  try {
    await handle.destroy();
  } catch {
    /* 열기에 실패한 문서는 닫을 것이 없다 */
  }
}

/**
 * 레거시 시스템 문서(`moss-board-system`)의 내용을 새 문서(`moss-board-<uuid>`)로
 * 옮긴다. 메모의 boardId는 null → SYSTEM_BOARD_ID로 재매핑한다. putNote가 같은 id로
 * 덮어쓰므로 중간에 끊겨 재실행해도 중복이 생기지 않는다.
 */
async function copyLegacyDoc(board: Board): Promise<void> {
  const legacy = openBoardDoc(LEGACY_SYSTEM_DOC_KEY);
  const target = openBoardDoc(SYSTEM_BOARD_ID);
  try {
    await Promise.all([legacy.whenLoaded, target.whenLoaded]);

    const notes = readNotes(legacy.doc);
    const connections = readConnections(legacy.doc);

    transactLocal(target.doc, () => {
      putBoard(target.doc, board);
      for (const note of notes) {
        // P1: lastVisitedAt을 Date.now()로 덮지 않는다 — 시스템 보드 큐레이팅
        // (selectors/systemBoard.ts가 lastVisitedAt으로 정렬)이 뭉개진다. 원래 값 유지.
        putNote(target.doc, { ...note, boardId: SYSTEM_BOARD_ID });
      }
      for (const connection of connections) {
        putConnection(target.doc, connection);
      }
    });
  } finally {
    await destroyQuietly(legacy);
    await destroyQuietly(target);
  }

  // P1: 옛 문서를 지우지 않고 되돌리기용 백업으로 남긴다. systemBoardMigratedAt
  // 마커가 재스캔을 막으므로 다음 실행에서 다시 읽지 않는다.
}

/**
 * 시스템 보드를 UUID id로 이전한다. 미완·중단이면 다시 돌아도 같은 결과를 낸다.
 * 호출자가 Web Lock 안에서 부른다(여러 탭 동시 이전 방지).
 */
export async function migrateSystemBoard(
  db: MossDB = getDB(),
): Promise<SystemBoardMigrationResult> {
  const settings = (await db.settings.get("singleton")) ?? { ...DEFAULT_SETTINGS };
  const existing = (await db.boards.get(SYSTEM_BOARD_ID)) as Board | undefined;

  if (settings.systemBoardMigratedAt && existing) {
    return { migrated: false, boardId: SYSTEM_BOARD_ID, movedNotes: 0 };
  }

  const board = ensureSystemBoardRow(existing);
  await db.boards.put(board);

  // Dexie 메모의 boardId=null을 새 id로 옮긴다. 한 트랜잭션 — 중간 실패 시 원자적.
  let movedNotes = 0;
  await db.transaction("rw", db.notes, async () => {
    const nullIds = (await db.notes
      .filter((n) => n.boardId === null)
      .primaryKeys()) as string[];
    if (nullIds.length > 0) {
      await db.notes
        .where("id")
        .anyOf(nullIds)
        .modify((n) => {
          if (n.boardId === null) n.boardId = SYSTEM_BOARD_ID;
        });
    }
    movedNotes = nullIds.length;
  });

  await copyLegacyDoc(board);

  const next: Settings = {
    ...settings,
    id: "singleton",
    systemBoardId: SYSTEM_BOARD_ID,
    systemBoardMigratedAt: Date.now(),
  };
  await db.settings.put(next);

  return { migrated: true, boardId: SYSTEM_BOARD_ID, movedNotes };
}
