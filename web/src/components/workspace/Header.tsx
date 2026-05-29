"use client";

import { useT } from "@/i18n/Provider";
import { BoardPicker } from "./BoardPicker";
import { Breadcrumb } from "./Breadcrumb";
import { SubcanvasUndoToast } from "./SubcanvasUndoToast";

export function Header() {
  const t = useT();

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg px-5">
      {/* FEAT-subcanvas: 함 삭제 5초 undo 토스트 (position: fixed — 헤더 밖에 렌더). */}
      <SubcanvasUndoToast />
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold tracking-tight text-text">
          moss<span className="text-accent-lime">.</span>
        </span>
        <span className="text-text-soft">·</span>

        {/* FEAT-subcanvas: 서브 캔버스 조상 경로 — 중첩 시에만 표시. */}
        <Breadcrumb />
        <BoardPicker />
      </div>

      <div className="flex items-center gap-2 text-base text-text-muted">
        <IconButton label={t("common.search")}>🔍</IconButton>
        <IconButton label={t("common.notifications")}>🔔</IconButton>
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
