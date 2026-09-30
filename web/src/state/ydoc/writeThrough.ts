import type * as Y from "yjs";
import type { Board, Connection, Note } from "@/state/db/schema";
import { getDB } from "@/state/db/schema";
import { broadcastDocWrite } from "@/state/db/liveSync";
import {
  closeBoardDoc,
  discardBoardDocByKey,
  docKeyForBoard,
  getOrOpenBoardDoc,
  isActiveBoard,
  scheduleInactiveClose,
} from "./activeDoc";
import {
  connectionsMap,
  deleteConnection,
  deleteNote,
  filesMap,
  metaMap,
  notesMap,
  putBoard,
  putConnection,
  putNote,
  readNote,
} from "./model";
import { transactLocal } from "./origin";
import { forgetSharedSnapshot } from "./sharedSnapshot";

// n23 재심사 2R-7: 비활성 문서 close 타이머는 activeDoc이 키 단위로 소유한다.
// 기존 테스트·호출부를 위해 TTL 조절·상수는 여기서 재노출한다.
export { INACTIVE_DOC_TTL_MS, __setInactiveDocTtlForTest } from "./activeDoc";

/**
 * FEAT-collab-auth n23 작업 3 — 가져오기·브리지가 보드 문서에 직접 쓰는 단일 경로.
 *
 * 활성 보드는 그 문서에 바로 쓴다(attachLiveDoc이 로컬 origin을 방송). 비활성
 * 보드는 열고-쓰고-변경분만 탭 간 방송하고-닫는다. 그래야 원본이 Y.Doc 하나라는
 * D3가 가져오기·브리지에서도 유지된다(Dexie는 미러).
 *
 * n23 재심사 2R-4: `closeNow`면 TTL 없이 쓰기 직후 닫는다 — 가져오기처럼 문서를
 * 많이 여는 경로가 동시 열기 상한(4)을 넘지 않게 한다.
 */
export async function writeToBoardDoc(
  storageBoardId: string | null,
  write: (doc: Y.Doc) => void,
  opts?: { closeNow?: boolean },
): Promise<void> {
  const key = docKeyForBoard(storageBoardId);
  const handle = getOrOpenBoardDoc(storageBoardId);
  try {
    await handle.whenLoaded;
  } catch (err) {
    // n23 P1-4: 로드 실패 핸들은 버려 재시도가 새로 열 수 있게 한다.
    discardBoardDocByKey(key);
    throw err;
  }
  if (isActiveBoard(storageBoardId)) {
    write(handle.doc);
    return;
  }
  broadcastDocWrite(key, handle.doc, () => write(handle.doc));
  if (opts?.closeNow) {
    closeBoardDoc(storageBoardId);
    return;
  }
  // n23 P1-9: 연속 op(같은 보드에 브리지가 여러 번 씀)마다 문서 전체를 다시 열고
  // 닫지 않도록 짧은 TTL 동안 열어 둔다. TTL 안에 재사용되면 타이머를 리셋한다.
  scheduleInactiveClose(storageBoardId);
}

/** 메모를 자기 보드 문서에 쓴다(없으면 생성). */
export function writeNoteRecord(note: Note): Promise<void> {
  return writeToBoardDoc(note.boardId ?? null, (doc) => putNote(doc, note));
}

export function deleteNoteRecord(
  id: string,
  storageBoardId: string | null,
): Promise<void> {
  // n23 재심사 2R-2: 문서에서 지운 메모의 공유 스냅샷을 버린다(누수 방지).
  forgetSharedSnapshot(id);
  return writeToBoardDoc(storageBoardId, (doc) => deleteNote(doc, id));
}

/** 보드 메타를 자기 문서에 쓴다. */
export function writeBoardRecord(board: Board): Promise<void> {
  return writeToBoardDoc(board.id, (doc) => putBoard(doc, board));
}

/**
 * 연결선 소유 보드를 원본 문서에서 판정한다. Dexie 미러는 어느 문서를 열지 찾는
 * 힌트일 뿐, 문서에 있는 메모의 boardId가 최종 소유자다. source 메모를 못 찾으면
 * 소유자를 알 수 없으므로 undefined(문서를 쓰지 않는다).
 */
async function resolveSourceBoardId(
  sourceNoteId: string,
): Promise<string | null | undefined> {
  const mirror = await getDB().notes.get(sourceNoteId);
  if (!mirror) return undefined;
  const boardId = mirror.boardId ?? null;
  const handle = getOrOpenBoardDoc(boardId);
  await handle.whenLoaded;
  const note = readNote(handle.doc, sourceNoteId);
  return note ? (note.boardId ?? null) : boardId;
}

/**
 * 연결선을 source 메모의 보드 문서에 쓴다(작업 7 — 소유 문서는 한쪽뿐).
 * sourceBoardId를 주지 않으면 원본 문서에서 판정한다.
 */
export async function writeConnectionRecord(
  connection: Connection,
  sourceBoardId?: string | null,
): Promise<void> {
  let boardId = sourceBoardId;
  if (boardId === undefined) {
    boardId = await resolveSourceBoardId(connection.sourceNoteId);
    if (boardId === undefined) return; // 소유자 미상 — 쓸 문서가 없다.
  }
  await writeToBoardDoc(boardId, (doc) => putConnection(doc, connection));
}

export async function deleteConnectionRecord(
  connectionId: string,
  sourceNoteId: string,
  sourceBoardId?: string | null,
): Promise<void> {
  let boardId = sourceBoardId;
  if (boardId === undefined) {
    boardId = await resolveSourceBoardId(sourceNoteId);
    if (boardId === undefined) return;
  }
  await writeToBoardDoc(boardId, (doc) => deleteConnection(doc, connectionId));
}

/** overwrite 가져오기 — 보드 문서의 공유 내용(메모·연결선·메타)을 비운다. */
export function clearBoardRecords(
  storageBoardId: string | null,
  opts?: { closeNow?: boolean },
): Promise<void> {
  return writeToBoardDoc(
    storageBoardId,
    (doc) => {
      transactLocal(doc, () => {
        notesMap(doc).clear();
        connectionsMap(doc).clear();
        metaMap(doc).clear();
        filesMap(doc).clear();
      });
    },
    opts,
  );
}
