"use client";

import { useWorkspace, MIN_SCALE, MAX_SCALE } from "@/state/workspace";
import { useT } from "@/i18n/Provider";

import { canvasControlInsets, zoomBottom } from "@/design/canvasControls";
import { useCompactControls, useStackedZoomControls } from "./useCompactControls";
import styles from "./canvasControls.module.css";

const ZOOM_STEP = 1.2;

export function ZoomBar() {
  const t = useT();
  const compact = useCompactControls();
  const stacked = useStackedZoomControls();
  const selected = useWorkspace((s) => s.selectedIds.length > 0);
  const scale = useWorkspace((s) => s.viewport.scale);
  const setScale = useWorkspace((s) => s.setScale);
  const fitAllCards = useWorkspace((s) => s.fitAllCards);
  const resetViewport = useWorkspace((s) => s.resetViewport);
  const overview = (contentOnly = false) => {
    const root = document.querySelector('[data-canvas-root="true"]');
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const controls = Array.from(document.querySelectorAll('[data-canvas-control]:not([data-canvas-control="privacy"])'), el => el.getBoundingClientRect());
    fitAllCards({ width: rect.width, height: rect.height,
      insets: canvasControlInsets(rect.width, rect.height, rect, controls),
      ...(contentOnly ? { contentOnly: true } : {}) });
  };

  return (
    <div
      data-canvas-control="zoom"
      data-compact={compact}
      data-selected={selected}
      className={`${styles.zoom} pointer-events-auto absolute right-5 z-[var(--z-panel)] flex items-center gap-0.5 rounded-md px-1.5 py-1`}
      style={{
        bottom: `calc(${stacked ? zoomBottom : 20}px + env(safe-area-inset-bottom, 0px))`,
        background: "var(--gradient-paper)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <IconButton
        label={t("workspace.zoom.out")}
        disabled={scale <= MIN_SCALE + 0.001}
        onClick={() => setScale(scale / ZOOM_STEP)}
      >
        −
      </IconButton>
      <button
        onClick={() => setScale(1)}
        title={t("workspace.zoom.fit")}
        aria-label={t("workspace.zoom.fit")}
        className="min-w-[3.2rem] cursor-pointer rounded px-1.5 py-0.5 text-center text-[11px] text-text-muted hover:bg-[color:var(--color-hover)]"
      >
        {Math.round(scale * 100)}%
      </button>
      <IconButton
        label={t("workspace.zoom.in")}
        disabled={scale >= MAX_SCALE - 0.001}
        onClick={() => setScale(scale * ZOOM_STEP)}
      >
        +
      </IconButton>
      <IconButton label={t("reviewCanvas.contentView")} onClick={() => overview(true)}>
        {t("reviewCanvas.contentShort")}
      </IconButton>
      <IconButton label={t("workspace.zoom.all")} onClick={() => overview()}>
        ⛶
      </IconButton>
      <div className="mx-1 h-4 w-px bg-border" />
      <IconButton label={t("workspace.zoom.reset")} onClick={resetViewport}>
        ▦
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded px-2 py-0.5 text-[13px] text-text-muted transition-colors hover:bg-[color:var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
