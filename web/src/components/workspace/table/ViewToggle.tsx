"use client";

import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-table-view AC-1 — 캔버스 ↔ 전체 메모 표 전환 토글.
 *
 * spec §6은 "Header 안 ViewToggle"이라 적었지만 현재 레이아웃은 헤더 없이
 * 캔버스 위 floating chrome(브레드크럼·독·줌바)만 쓰고 Header.tsx는 마운트되지
 * 않은 죽은 코드다. 화면 우상단 고정 토글로 두어 기존 레이아웃을 깨지 않는다.
 * ───────────────────────────────────────────────────────────── */

export function ViewToggle() {
  const t = useT();
  const view = useWorkspace((s) => s.view);
  const setView = useWorkspace((s) => s.setView);

  const btnClass = (active: boolean) =>
    [
      "cursor-pointer rounded-full px-3 py-1 text-xs transition-colors",
      active
        ? "bg-accent-lime text-bg"
        : "text-text-muted hover:bg-[color:var(--color-hover)]",
    ].join(" ");

  return (
    <div
      role="tablist"
      aria-label={t("workspace.table.viewToggle.label")}
      className="pointer-events-auto flex items-center gap-0.5 rounded-full p-0.5"
      style={{
        background: "var(--gradient-paper)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <button
        role="tab"
        type="button"
        aria-selected={view === "canvas"}
        onClick={() => setView("canvas")}
        className={btnClass(view === "canvas")}
      >
        {t("workspace.table.view.canvas")}
      </button>
      <button
        role="tab"
        type="button"
        aria-selected={view === "table"}
        onClick={() => setView("table")}
        className={btnClass(view === "table")}
      >
        {t("workspace.table.view.table")}
      </button>
    </div>
  );
}
