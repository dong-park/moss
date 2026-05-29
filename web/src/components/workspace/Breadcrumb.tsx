"use client";

import { useMemo } from "react";
import {
  useWorkspace,
  computeBreadcrumb,
  SYSTEM_BOARD_ID,
} from "@/state/workspace";
import { useT } from "@/i18n/Provider";

/**
 * FEAT-subcanvas — 서브 캔버스 경로 브레드크럼.
 * currentBoardId의 parentBoardId 체인 중 "조상" 조각만 그린다(현재 보드는
 * BoardPicker가 표시). 조각 클릭 → 해당 상위 보드로 전환.
 * 루트(조상 없음)나 시스템 보드에서는 아무것도 렌더하지 않는다.
 */
export function Breadcrumb() {
  const t = useT();
  const boards = useWorkspace((s) => s.boards);
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const setCurrentBoard = useWorkspace((s) => s.setCurrentBoard);

  const chain = useMemo(
    () => computeBreadcrumb(boards, currentBoardId),
    [boards, currentBoardId],
  );

  // 현재 보드를 제외한 조상들만 클릭 가능한 조각으로.
  const ancestors = chain.slice(0, -1);
  if (ancestors.length === 0) return null;

  const labelOf = (id: string, name: string) =>
    id === SYSTEM_BOARD_ID
      ? t("workspace.boardPicker.system")
      : name.trim() === ""
        ? t("cards.board.unnamed")
        : name;

  return (
    <nav
      aria-label={t("workspace.subcanvas.breadcrumb.label")}
      className="flex items-center gap-1 text-sm text-text-muted"
    >
      {ancestors.map((b) => (
        <span key={b.id} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void setCurrentBoard(b.id)}
            className="cursor-pointer rounded-md px-1.5 py-1 transition-colors hover:bg-panel hover:text-text"
          >
            {labelOf(b.id, b.name)}
          </button>
          <span className="text-text-soft">›</span>
        </span>
      ))}
    </nav>
  );
}
