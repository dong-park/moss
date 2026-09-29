"use client";

/**
 * FEAT-collab-auth n9 — 공유 해제·내보내기·다른 기기 (D11·D13).
 *
 * - 해제·연결 거절(4403) 신호를 받으면 편집자 기기의 로컬 사본(y-indexeddb + Dexie
 *   파생 행)을 0건으로 만들고 "공유가 끝난 보드예요"를 한 번 띄운다 (AC-13·AC-14).
 * - 소유자 기기는 보드를 남기고 혼자 쓰기(local)로 되돌린다.
 * - 로그인 직후·앱 시작 때 `GET /me/boards`로 공유 보드를 받아 목록에 추가한다(D13·AC-17).
 *   혼자 쓰는 보드는 건드리지 않는다.
 *
 * 순수 로직은 deps 주입으로 테스트하고, 실경로는 기본 deps가 Ktor·Dexie·y-indexeddb를 탄다.
 */
import { t } from "@/i18n";
import { useAuth } from "./auth";
import type { BoardSummary } from "./auth/types";
import { getDB } from "./db/schema";
import { useToasts } from "./notifications";
import { realShareApi, type ShareApi } from "./share/api";
import { useShare } from "./share/store";
import { useStorage } from "./storage";
import {
  SYSTEM_BOARD_ID,
  __internal,
  aspectForKind,
  encodeSubcanvas,
  useWorkspace,
  widthForKind,
} from "./workspace";
import { deleteBoardDoc } from "./ydoc/activeDoc";
import { deleteNoteRecord, writeNoteRecord } from "./ydoc/writeThrough";

export interface MembershipDeps {
  api: ShareApi;
  /** y-indexeddb 문서 삭제. 테스트는 디스크를 건드리지 않게 대체한다. */
  deleteDoc: (boardId: string) => Promise<void>;
  notify: (message: string) => void;
}

const defaultDeps: MembershipDeps = {
  api: realShareApi,
  deleteDoc: (boardId) => deleteBoardDoc(boardId),
  notify: (message) => {
    useToasts.getState().push({ tone: "calm", title: message });
  },
};

let deps: MembershipDeps = defaultDeps;

export function configureMembership(next: Partial<MembershipDeps>): void {
  deps = { ...deps, ...next };
}

export function resetMembershipDeps(): void {
  deps = defaultDeps;
  notified.clear();
}

/** 같은 보드의 해제 알림을 한 번만 띄운다 (AC-13 "한 번"). */
const notified = new Set<string>();

/**
 * 편집자 기기의 보드 사본을 지운다. y-indexeddb 문서 + Dexie 파생 행
 * (notes·connections·embeddings·trash·trashConnections) + board 행.
 */
export async function purgeLocalBoardCopy(boardId: string): Promise<void> {
  await deps.deleteDoc(boardId);
  const db = getDB();
  const noteIds = (await db.notes.where("boardId").equals(boardId).primaryKeys()) as string[];
  await db.transaction(
    "rw",
    [db.notes, db.connections, db.embeddings, db.trash, db.trashConnections, db.boards],
    async () => {
      if (noteIds.length > 0) {
        const incident = (await db.connections
          .where("sourceNoteId")
          .anyOf(noteIds)
          .or("targetNoteId")
          .anyOf(noteIds)
          .primaryKeys()) as string[];
        await db.connections.bulkDelete(incident);
        await db.embeddings.bulkDelete(noteIds);
        await db.notes.bulkDelete(noteIds);

        const trashed = (await db.trash.toArray())
          .filter((e) => e.note.boardId === boardId)
          .map((e) => e.id);
        if (trashed.length > 0) {
          const parked = (await db.trashConnections
            .where("sourceNoteId")
            .anyOf(trashed)
            .or("targetNoteId")
            .anyOf(trashed)
            .primaryKeys()) as string[];
          await db.trashConnections.bulkDelete(parked);
          await db.trash.bulkDelete(trashed);
        }
      }
      await db.boards.delete(boardId);
    },
  );
  await removeSystemBoardCards(boardId);
}

/** 시스템 보드에서 이 보드를 가리키는 함 카드 id들. */
async function systemBoardCardIds(boardId: string): Promise<string[]> {
  const content = encodeSubcanvas(boardId);
  return (await getDB()
    .notes.filter(
      (n) =>
        (n.boardId === null || n.boardId === SYSTEM_BOARD_ID) &&
        n.kind === "board" &&
        n.content === content,
    )
    .primaryKeys()) as string[];
}

/**
 * 시스템 보드에서 기존 카드와 겹치지 않는 자리. (40,40)에서 카드 크기+간격만큼
 * 오른쪽 아래로 민다.
 */
async function freeSystemBoardSpot(): Promise<{ x: number; y: number }> {
  const w = widthForKind("board");
  const h = w / aspectForKind("board");
  const gap = 24;
  const taken = await getDB()
    .notes.filter((n) => n.boardId === null || n.boardId === SYSTEM_BOARD_ID)
    .toArray();
  // ponytail: 대각선 선형 탐색 — 카드 수백 개면 O(n²)지만 시스템 보드는 작다.
  for (let i = 0; ; i++) {
    const x = 40 + i * (w + gap);
    const y = 40 + i * (h + gap);
    const hit = taken.some(
      (n) =>
        x < n.x + (n.width || w) && n.x < x + w && y < n.y + (n.height ?? h) && n.y < y + h,
    );
    if (!hit) return { x, y };
  }
}

/**
 * 이 기기에 없던 공유 보드는 들어갈 입구가 없다 — 시스템 보드에 함 카드를 하나 만든다
 * (AC-17). 이미 있으면 만들지 않는다. 노트 행 모양은 브리지 notes.createBoard와 같다.
 */
async function ensureSystemBoardCard(boardId: string): Promise<void> {
  if ((await systemBoardCardIds(boardId)).length > 0) return;
  const { x, y } = await freeSystemBoardSpot();
  const note = await useStorage.getState().saveNote({
    id: `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
    boardId: SYSTEM_BOARD_ID,
    kind: "board",
    content: encodeSubcanvas(boardId),
    x,
    y,
    aiOptOut: false,
    rotation: 0,
  });
  await writeNoteRecord(note);
  if (useWorkspace.getState().currentBoardId === SYSTEM_BOARD_ID) {
    const card = __internal.decodeNoteToCard(note);
    useWorkspace.setState((s) => ({ cards: [...s.cards, card] }));
  }
}

async function removeSystemBoardCards(boardId: string): Promise<void> {
  const ids = await systemBoardCardIds(boardId);
  if (ids.length === 0) return;
  await getDB().notes.bulkDelete(ids);
  for (const id of ids) await deleteNoteRecord(id, SYSTEM_BOARD_ID);
  const gone = new Set(ids);
  useWorkspace.setState((s) => ({ cards: s.cards.filter((c) => !gone.has(c.id)) }));
}

/** 보드를 목록에서 빼고, 보고 있던 보드면 시스템 보드로 돌린다. */
async function removeBoardFromList(boardId: string): Promise<void> {
  const ws = useWorkspace.getState();
  if (ws.currentBoardId === boardId) {
    await ws.setCurrentBoard(SYSTEM_BOARD_ID);
  }
  const boards = await useStorage.getState().loadBoards();
  useWorkspace.setState({ boards });
}

/** 해제·내보내기 신호 — 사본 삭제 + 한 번 알림 (AC-13·AC-14). */
export async function handleBoardRevoked(boardId: string): Promise<void> {
  // 소유자는 자기가 해제한 보드를 잃지 않는다(AC-13) — 서버가 그 보드의 모든 연결을
  // 4403으로 끊으므로 소유자 기기도 이 신호를 받는다. 혼자 쓰는 보드로 되돌리기만 한다.
  if (useShare.getState().byBoard[boardId]?.role === "owner") {
    useShare.getState().forgetBoard(boardId);
    return;
  }
  await purgeLocalBoardCopy(boardId);
  await removeBoardFromList(boardId);
  useShare.getState().forgetBoard(boardId);
  if (!notified.has(boardId)) {
    notified.add(boardId);
    deps.notify(t("collab.share.revoked"));
  }
}

/** 편집자가 스스로 나간다 — 서버 자격은 그대로 두고 기기 사본만 지운다. */
export async function leaveBoard(boardId: string): Promise<void> {
  await purgeLocalBoardCopy(boardId);
  await removeBoardFromList(boardId);
}

/**
 * `GET /me/boards`로 이 계정의 공유 보드를 이 기기에 연다 (D13·AC-17).
 * 로그인 안 한 기기는 네트워크 0건(AC-1), 서버에서 사라진 공유 보드는 정리한다.
 */
export async function syncMyBoards(): Promise<void> {
  let session;
  try {
    session = await useAuth.getState().ensureSession();
  } catch {
    return; // 로그인 안 함 — 네트워크를 부르지 않는다 (AC-1)
  }

  let summaries: BoardSummary[];
  try {
    summaries = await deps.api.myBoards(session.accessToken);
  } catch {
    return; // 오프라인·5xx — 다음 기회에 다시 시도한다.
  }

  const storage = useStorage.getState();
  if (!storage.initialized) await storage.init();
  const localBoards = await storage.loadBoards();
  const localIds = new Set(localBoards.map((b) => b.id));
  const serverIds = new Set(summaries.map((s) => s.id));

  for (const summary of summaries) {
    if (!localIds.has(summary.id)) {
      await storage.saveBoard({
        id: summary.id,
        name: summary.name,
        remote: true,
        parentBoardId: SYSTEM_BOARD_ID,
      });
      await ensureSystemBoardCard(summary.id);
    }
    useShare.getState().restoreShared(summary.id, summary.role);
  }

  // 서버에서 사라진 보드 정리 — 소유자 기기 로컬 보드는 남기고, 원격 사본은 지운다.
  const known = useShare.getState().byBoard;
  for (const [boardId, info] of Object.entries(known)) {
    if (info.status !== "shared") continue;
    if (serverIds.has(boardId)) continue;
    const isRemote = localBoards.find((b) => b.id === boardId)?.remote === true;
    if (isRemote) {
      await purgeLocalBoardCopy(boardId);
      useShare.getState().forgetBoard(boardId);
    } else {
      // 소유자 기기의 로컬 보드 — 남기고 혼자 쓰기로 되돌린다 (D11).
      useShare.getState().setLocal(boardId);
    }
  }

  const fresh = await storage.loadBoards();
  useWorkspace.setState({ boards: fresh });
}
