"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/state/auth";
import { useCollab } from "@/state/collab";
import { handleBoardRevoked, syncMyBoards } from "@/state/membership";
import { useShare } from "@/state/share";
import { useWorkspace } from "@/state/workspace";

/**
 * FEAT-collab-auth n7/n9 — 현재 보드가 shared이고 로그인돼 있으면 Hocuspocus에
 * 붙이고, 아니면 끊는다.
 *
 * n9: 로그인 직후·앱 시작 때 `syncMyBoards()`로 `/me/boards`를 받아 공유 보드를
 * 이 기기에 연다(AC-17). 해제·내보내기 신호(close 4403)를 받으면 편집자 기기의
 * 로컬 사본을 지우고 한 번 알린다(AC-13·AC-14). 오프라인 여부는 연결 조건이
 * 아니다 — provider가 스스로 재연결하고, 그동안 편집은 y-indexeddb에 남는다(AC-10).
 */
export function CollabSession() {
  const boardId = useWorkspace((s) => s.currentBoardId);
  const authStatus = useAuth((s) => s.status);
  const userName = useAuth((s) => s.user?.name ?? null);
  const shared = useShare((s) => s.byBoard[boardId]?.status === "shared");
  const revokedBoardId = useCollab((s) => s.revokedBoardId);
  const handledRevokedRef = useRef<string | null>(null);

  useEffect(() => {
    if (userName) useCollab.getState().setUserName(userName);
  }, [userName]);

  // 로그인 직후·앱 시작 — 계정의 공유 보드를 이 기기에 연다 (D13·AC-17).
  useEffect(() => {
    if (authStatus === "authenticated") void syncMyBoards();
  }, [authStatus]);

  useEffect(() => {
    const collab = useCollab.getState();
    if (authStatus === "authenticated" && shared) {
      void collab.connect(boardId);
    } else if (collab.boardId !== null) {
      collab.disconnect();
    }
  }, [boardId, authStatus, shared]);

  // P2: 언마운트 시 provider를 남기지 않는다 — 라우트 이탈·보드 전환에서
  // 소켓과 awareness 리스너가 남는 것을 막는다.
  useEffect(() => () => useCollab.getState().disconnect(), []);

  // 해제·내보내기(close 4403) — store가 이미 재연결을 멈췄다. 사본 삭제 + 한 번 알림 (AC-13·AC-14).
  useEffect(() => {
    if (!revokedBoardId || handledRevokedRef.current === revokedBoardId) return;
    handledRevokedRef.current = revokedBoardId;
    void handleBoardRevoked(revokedBoardId);
  }, [revokedBoardId]);

  return null;
}
