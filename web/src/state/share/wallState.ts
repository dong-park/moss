"use client";

/**
 * local-promise n2 — 벽 하나의 공유 상태. 배지(n3)와 공유 시트(n4)가 이것만 읽는다.
 *
 * 네 값은 spec 상태 모델의 행과 같다.
 * - `local`: 서버 행도 동기화 연결도 없다.
 * - `uploading`: 서버 행을 만들고 벽 내용을 올리는 중. 업로드용 연결만 있다.
 * - `shared`: 서버가 벽 내용을 받았다. 서버 행과 동기화 연결이 있다.
 * - `sharedLoggedOut`: 서버 행은 있고 로그아웃·세션 만료로 동기화 연결이 없다.
 *   로그아웃해도 사본은 남는다(D5).
 */
import { useAuth } from "@/state/auth";
import { useShare } from "./store";
import type { ShareStatus } from "./types";

export type WallShareState = "local" | "uploading" | "shared" | "sharedLoggedOut";

export interface WallShareInputs {
  /** `useShare.byBoard[id].status`. 기록이 없으면 `local`. */
  status: ShareStatus;
  /** 공유 시작이 서버 행을 만들고 업로드하는 단계에 있다. */
  uploading: boolean;
  /** 지금 유효한 로그인 세션이 있다. */
  signedIn: boolean;
}

/** 입력 셋에서 네 값 중 하나를 정한다. 서버 행이 있으면(shared) 업로드 중으로 보지 않는다. */
export function deriveWallShareState({ status, uploading, signedIn }: WallShareInputs): WallShareState {
  if (status === "shared") return signedIn ? "shared" : "sharedLoggedOut";
  return uploading ? "uploading" : "local";
}

/** 세션이 만료(`expired`)됐거나 로그아웃(`anonymous`)이면 동기화 연결을 붙일 수 없다. */
function isSignedIn(authStatus: string): boolean {
  return authStatus === "authenticated";
}

/** 스토어 값을 지금 읽는다(구독 없음). */
export function wallShareState(boardId: string): WallShareState {
  const share = useShare.getState();
  return deriveWallShareState({
    status: share.byBoard[boardId]?.status ?? "local",
    uploading: share.phaseByBoard[boardId] === "uploading",
    signedIn: isSignedIn(useAuth.getState().status),
  });
}

/** 화면용 구독. 입력이 바뀔 때만 다시 그린다. */
export function useWallShareState(boardId: string): WallShareState {
  const status = useShare((s) => s.byBoard[boardId]?.status ?? "local");
  const uploading = useShare((s) => s.phaseByBoard[boardId] === "uploading");
  const signedIn = useAuth((s) => isSignedIn(s.status));
  return deriveWallShareState({ status, uploading, signedIn });
}
