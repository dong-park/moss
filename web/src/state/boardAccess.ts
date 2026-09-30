"use client";

/**
 * FEAT-onboarding-routes n5 — `/b/[boardId]`로 들어온 보드 주소를 판정한다.
 *
 * n3에서 URL이 보드 전환의 원본이 됐지만, 로컬에 없는 id로 들어오면
 * `setCurrentBoard`가 빈 보드 행을 만들어 버렸다. 이 모듈이 "이 주소를 열어도
 * 되는가"를 먼저 판정해 그 경로를 막는다 (AC-8의 핵심).
 *
 * 판정 순서:
 * 1. 시스템 보드 / 로컬 보드 → 연다.
 * 2. 로컬에 있었지만 사라진 보드(휴지통 흔적·삭제 undo 대기) → "찾을 수 없는 보드예요"(AC-8).
 * 3. 로그인 세션이 없으면 → "이 보드를 볼 수 없어요"(AC-10).
 * 4. 오프라인이면 → "연결되면 다시 시도할게요"(AC-13).
 * 5. 서버에 멤버십을 묻는다 — 멤버면 연다(AC-9), 아니면 "이 보드를 볼 수 없어요"(AC-10).
 *    네트워크 실패는 오프라인으로 본다(AC-13).
 *
 * 멤버 아님과 서버에 없음은 구분하지 않는다 — 보드 존재 여부를 드러내지 않는다(AC-10).
 * 순수 로직은 deps 주입으로 테스트한다(membership.ts와 같은 패턴).
 */
import { useAuth, SessionExpiredError } from "./auth";
import { SYSTEM_BOARD_ID } from "./boardIds";
import { getDB } from "./db/schema";
import { openSharedBoard } from "./membership";
import { useWorkspace } from "./workspace";

export type BoardAccess =
  /** 로컬(또는 시스템) 보드 — 그대로 연다. */
  | { kind: "open" }
  /** 서버에서 받아 연 공유 보드 — 원격 행이 이미 저장됐다. */
  | { kind: "shared" }
  /** 로컬에 있었으나 사라진 보드 (AC-8). */
  | { kind: "not-found" }
  /** 멤버가 아니거나 서버에도 없음 — 존재 여부를 드러내지 않는다 (AC-10). */
  | { kind: "no-access" }
  /** 오프라인이라 서버에 물을 수 없음 (AC-13). */
  | { kind: "offline" };

export interface BoardAccessDeps {
  /** 이 기기에 보드 행이 있는가. */
  isLocalBoard: (boardId: string) => Promise<boolean>;
  /** 로컬에 있었지만 사라진 보드인가(휴지통 흔적·삭제 대기). */
  isGoneLocalBoard: (boardId: string) => Promise<boolean>;
  hasSession: () => boolean;
  isOnline: () => boolean;
  /**
   * 서버 멤버십 확인 + 멤버면 원격 사본 저장. true를 돌려주면 로컬 행(보드 행·시스템
   * 보드 입구 카드)이 이미 저장돼 있다 — 이름이 저장까지 포함함을 말한다.
   */
  openAndPersistShared: (boardId: string) => Promise<boolean>;
}

const defaultDeps: BoardAccessDeps = {
  isLocalBoard: async (boardId) => {
    const boards = await getDB().boards.toArray();
    return boards.some((b) => b.id === boardId);
  },
  isGoneLocalBoard: async (boardId) => {
    // P1: 보드 행 삭제 시 남긴 id 목록. 파일함 카드 삭제처럼 휴지통 흔적이 없는
    // 경로도 이 목록으로 "이 기기에 있던 보드"임을 안다(AC-8).
    const settings = await getDB().settings.get("singleton");
    if (settings?.deletedBoardIds?.includes(boardId)) return true;
    // 지운 보드의 메모가 휴지통에 남아 있으면 "이 기기에 있던 보드"라는 흔적이다.
    const trashed = await getDB()
      .trash.filter((e) => e.note.boardId === boardId)
      .count();
    if (trashed > 0) return true;
    // 방금 지운 보드(5초 undo 대기)도 같은 카드로 안내한다.
    return useWorkspace.getState().pendingBoardUndo?.board.id === boardId;
  },
  hasSession: () => useAuth.getState().session !== null,
  isOnline: () =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  openAndPersistShared: async (boardId) =>
    (await openSharedBoard(boardId)) !== null,
};

export async function resolveBoardAccess(
  boardId: string,
  deps: BoardAccessDeps = defaultDeps,
): Promise<BoardAccess> {
  if (boardId === SYSTEM_BOARD_ID) return { kind: "open" };
  if (await deps.isLocalBoard(boardId)) return { kind: "open" };
  if (await deps.isGoneLocalBoard(boardId)) return { kind: "not-found" };
  if (!deps.hasSession()) return { kind: "no-access" };
  if (!deps.isOnline()) return { kind: "offline" };
  try {
    const member = await deps.openAndPersistShared(boardId);
    return member ? { kind: "shared" } : { kind: "no-access" };
  } catch (err) {
    // 세션 만료는 로그인 버튼으로 안내(AC-10), 그 밖의 실패는 연결 문제로 본다(AC-13).
    if (err instanceof SessionExpiredError) return { kind: "no-access" };
    return { kind: "offline" };
  }
}
