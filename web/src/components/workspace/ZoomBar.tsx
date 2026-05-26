"use client";

import { useWorkspace, MIN_SCALE, MAX_SCALE } from "@/state/workspace";
import { useT } from "@/i18n/Provider";

const ZOOM_STEP = 1.2;

export function ZoomBar() {
  const t = useT();
  const scale = useWorkspace((s) => s.viewport.scale);
  const setScale = useWorkspace((s) => s.setScale);
  const resetViewport = useWorkspace((s) => s.resetViewport);

  return (
    <div
      className="pointer-events-auto absolute bottom-5 right-5 z-[var(--z-panel)] flex items-center gap-0.5 rounded-md px-1.5 py-1"
      style={{
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
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded px-2 py-0.5 text-[13px] text-text-muted transition-colors hover:bg-[color:var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
