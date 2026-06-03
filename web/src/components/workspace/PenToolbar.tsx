"use client";

import {
  useWorkspace,
  PEN_MIN_WIDTH,
  PEN_MAX_WIDTH,
} from "@/state/workspace";
import { useT } from "@/i18n/Provider";

/** 미리보기 점 지름(px) — penWidth(1..12)를 화면에서 읽기 좋은 범위로 매핑. */
function previewDiameter(width: number): number {
  return Math.min(16, Math.max(3, Math.round(width * 1.4)));
}

/**
 * FEAT-pen-mode-ux B3 (AC-3): 도구·굵기 HUD 툴바.
 *
 * 현재 펜/지우개와 굵기를 상시 보여주고, 키보드 단축키(E 토글, [ / ] 굵기)와 동일한
 * 동작을 클릭으로도 제공한다. E/[/]로 바뀌면 같은 전역 상태(penTool/penWidth)를
 * 구독하므로 툴바가 즉시 반영한다.
 *
 * penMode/penTool/penWidth를 개별 selector로 atomic 구독(§8 성능). 토글·굵기 변경은
 * 기존 setPenTool/setPenWidth만 호출 — 신규 액션을 만들지 않는다(범위 §2).
 * role="toolbar" + 버튼 aria-pressed로 접근성을 보장한다(§8).
 */
export function PenToolbar() {
  const t = useT();
  const penMode = useWorkspace((s) => s.penMode);
  const penTool = useWorkspace((s) => s.penTool);
  const penWidth = useWorkspace((s) => s.penWidth);
  const setPenTool = useWorkspace((s) => s.setPenTool);
  const setPenWidth = useWorkspace((s) => s.setPenWidth);

  if (!penMode) return null;

  const d = previewDiameter(penWidth);

  return (
    <div
      role="toolbar"
      aria-label={t("workspace.pen.toolbar.label")}
      className="pointer-events-auto absolute bottom-[4.25rem] right-5 z-[var(--z-panel)] flex items-center gap-1 rounded-md px-1.5 py-1"
      style={{
        background: "var(--gradient-paper)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* 펜 / 지우개 토글 — E 단축키와 동일 */}
      <ToolButton
        label={t("workspace.pen.toolbar.pen")}
        shortcut="E"
        pressed={penTool === "pen"}
        onClick={() => setPenTool("pen")}
      >
        ✏️
      </ToolButton>
      <ToolButton
        label={t("workspace.pen.toolbar.eraser")}
        shortcut="E"
        pressed={penTool === "eraser"}
        onClick={() => setPenTool("eraser")}
      >
        🧽
      </ToolButton>

      <div className="mx-0.5 h-4 w-px bg-border" />

      {/* 굵기 — [ / ] 단축키와 동일. 가운데 미리보기 점이 현재 굵기를 보여준다. */}
      <IconButton
        label={t("workspace.pen.toolbar.thinner")}
        shortcut="["
        disabled={penWidth <= PEN_MIN_WIDTH + 0.001}
        onClick={() => setPenWidth(penWidth - 1)}
      >
        −
      </IconButton>
      <span
        aria-label={`${t("workspace.pen.toolbar.width")} ${penWidth}`}
        title={`${t("workspace.pen.toolbar.width")} ${penWidth}`}
        className="flex h-5 w-6 items-center justify-center"
      >
        <span
          aria-hidden="true"
          className="rounded-full bg-text"
          style={{ width: d, height: d }}
        />
      </span>
      <IconButton
        label={t("workspace.pen.toolbar.thicker")}
        shortcut="]"
        disabled={penWidth >= PEN_MAX_WIDTH - 0.001}
        onClick={() => setPenWidth(penWidth + 1)}
      >
        +
      </IconButton>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={`${label} (${shortcut})`}
      onClick={onClick}
      className={[
        "flex h-7 items-center gap-1 rounded px-2 text-[13px] transition-colors",
        pressed
          ? "bg-[color:var(--color-hover)] text-text"
          : "text-text-muted hover:bg-[color:var(--color-hover)]",
      ].join(" ")}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function IconButton({
  label,
  shortcut,
  children,
  onClick,
  disabled,
}: {
  label: string;
  shortcut: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${shortcut})`}
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded px-2 py-0.5 text-[13px] text-text-muted transition-colors hover:bg-[color:var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
