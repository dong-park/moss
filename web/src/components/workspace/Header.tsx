"use client";

import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { ShareControl } from "@/components/share/ShareControl";
import { BoardPicker } from "./BoardPicker";

export function Header() {
  const t = useT();
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const boards = useWorkspace((s) => s.boards);
  const currentBoard = boards.find((b) => b.id === currentBoardId) ?? null;

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg px-5">
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold tracking-tight text-text">
          moss<span className="text-accent-lime">.</span>
        </span>
        <span className="text-text-soft">·</span>

        <BoardPicker />
      </div>

      <div className="flex items-center gap-2 text-base text-text-muted">
        {currentBoard ? (
          <ShareControl
            boardId={currentBoard.id}
            boardName={currentBoard.name}
          />
        ) : null}
        <IconButton label={t("common.search")}>🔍</IconButton>
        {/* 2026-09-19 사용자 결정: 시그널스(AI 모드) 관련 알림 아이콘 임시 숨김 — 삭제 아님.
        <IconButton label={t("common.notifications")}>🔔</IconButton>
        */}
        <button
          aria-label={t("common.profile")}
          className="ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-accent-lime text-sm text-bg transition-opacity hover:opacity-80"
        >
          ⊙
        </button>
      </div>
    </header>
  );
}

function IconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-panel"
    >
      {children}
    </button>
  );
}
