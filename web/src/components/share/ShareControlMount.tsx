"use client";

import { useEffect } from "react";
import { useCollab } from "@/state/collab";
import { leaveBoard } from "@/state/membership";
import { useShare } from "@/state/share";
import { useWorkspace } from "@/state/workspace";
import { ShareControl } from "./ShareControl";

/**
 * FEAT-collab-auth n7/n9 — 현재 보드의 공유 아이콘을 우상단에 붙이는 배선.
 * local-promise n3: 배지는 모든 벽에 보인다. n5: 시스템 보드(첫 벽)도 공유 버튼을 가진다 —
 * 모든 기기가 같은 고정 UUID를 쓰므로 그대로는 올리지 못하고, 시트가 같은 내용을 새 벽으로
 * 옮겨 그 벽을 공유한다(`state/share/firstWall.ts`).
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

  if (!board) return null;

  return (
    <ShareControl
      boardId={board.id}
      boardName={board.name}
      firstWall={board.isSystem}
      role={info?.role}
      members={info?.members}
      onStartShare={(id) => {
        // 첫 벽은 새 벽으로 옮겨 공유한다 — 아직 그 벽으로 넘어오기 전이면 CollabSession이 붙인다.
        if (useWorkspace.getState().currentBoardId === id) void useCollab.getState().connect(id);
      }}
      onLeaveBoard={(id) => void leaveBoard(id)}
    />
  );
}
