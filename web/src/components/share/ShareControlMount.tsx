"use client";

import { useEffect } from "react";
import { useCollab } from "@/state/collab";
import { leaveBoard } from "@/state/membership";
import { useShare } from "@/state/share";
import { useWorkspace } from "@/state/workspace";
import { ShareControl } from "./ShareControl";

/**
 * FEAT-collab-auth n7/n9 — 현재 보드의 공유 아이콘을 우상단에 붙이는 배선.
 * 시스템 보드에는 공유가 없다. 모든 기기가 같은 고정 UUID를 쓰므로 서버 행이 겹친다.
 * n8의 ShareControl을 그대로 쓴다.
 *
 * n9: 역할·멤버 목록을 `useShare`(=`/me/boards`·`GET /boards/{id}/members`)에서 넘기고,
 * 편집자 나가기는 로컬 사본 정리(`leaveBoard`)에 꽂는다.
 */
export function ShareControlMount() {
  const boardId = useWorkspace((s) => s.currentBoardId);
  const boards = useWorkspace((s) => s.boards);
  const info = useShare((s) => s.byBoard[boardId]);
  const board = boards.find((b) => b.id === boardId);
  const shared = info?.status === "shared";

  useEffect(() => {
    if (shared) void useShare.getState().loadMembers(boardId);
  }, [boardId, shared]);

  if (!board || board.isSystem) return null;

  return (
    <ShareControl
      boardId={board.id}
      boardName={board.name}
      role={info?.role}
      members={info?.members}
      onStartShare={(id) => void useCollab.getState().connect(id)}
      onLeaveBoard={(id) => void leaveBoard(id)}
    />
  );
}
