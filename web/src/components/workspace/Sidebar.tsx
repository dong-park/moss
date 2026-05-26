"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import {
  CAPTURE_TOOLS,
  SYSTEM_BOARD_ID,
  useWorkspace,
  type CaptureToolId,
  type ToolId,
} from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";

/** 드래그로 인정하기 위한 최소 이동 거리 — 단순 클릭과 구분. */
const DRAG_THRESHOLD = 4;

/**
 * 아이콘 세트 변형. v1 / v2 등 새 버전 생성 시 여기서 토글.
 * 빈 문자열 = 기본(접미사 없음).
 */
const ICON_VARIANT = "v2";
const iconSrc = (id: string) =>
  `/icons/sidebar/${id}${ICON_VARIANT ? `-${ICON_VARIANT}` : ""}.png`;

type SvgComp = React.FC<{ size?: number }>;

type Item = {
  toolId: ToolId;
  /** PNG 파일명 (public/icons/sidebar/<png>-v2.png). svg 우선 사용. */
  png?: string;
  /** 인라인 SVG 컴포넌트. PNG가 없는 새 도구용. */
  svg?: SvgComp;
  /** i18n 라벨 키. 없으면 라벨 미표시. */
  labelKey?: string;
};

/**
 * 캡처 도구별 시각 메타. ToolId → {png|svg, labelKey} 매핑.
 * 순서·인덱스는 [[CAPTURE_TOOLS]]가 단일 SOT (Cmd+1~0 단축키와 합의).
 * 새 도구 추가 시: workspace.ts CAPTURE_TOOLS에 추가 + 본 메타에 같은 toolId 등록.
 */
// FEAT-markdown-memo-pen: checklist/code/highlight는 마크다운 메모로 통합,
// handwriting은 펜 모드로 대체 → 캡처 도구에서 제거. text 라벨은 "메모".
const CAPTURE_META: Record<CaptureToolId, Omit<Item, "toolId">> = {
  text:    { png: "note",    labelKey: "capture.tool.text" },
  image:   { png: "image",   labelKey: "capture.tool.image" },
  link:    { png: "link",    labelKey: "capture.tool.link" },
  audio:   { png: "audio",   labelKey: "capture.tool.audio" },
  mindmap: { png: "mindmap", labelKey: "capture.tool.mindmap" },
  file:    { png: "upload",  labelKey: "capture.tool.file" },
};

/**
 * 캡처 10종 — CAPTURE_TOOLS 순서를 그대로 따른다.
 * Cmd+1 ~ Cmd+0 인덱스가 사이드바 시각 순서와 항상 일치.
 */
const CAPTURE_GROUP: Item[] = CAPTURE_TOOLS.map((toolId) => ({
  toolId,
  ...CAPTURE_META[toolId],
}));

/** 캔버스 정리 도구 (다른 FEAT 담당). 캡처가 아니어서 drop 시에도 capture 카드를 만들지 않는다. */
const CANVAS_GROUP: Item[] = [
  // FEAT-markdown-memo-pen: 펜 — 모드 토글(드롭-캡처 아님). draw 아이콘 재사용.
  { toolId: "pen",     png: "draw",    labelKey: "workspace.tool.pen" },
  { toolId: "line",    png: "line",    labelKey: "workspace.tool.line" },
  { toolId: "board",   png: "board",   labelKey: "workspace.tool.board" },
  { toolId: "column",  png: "column",  labelKey: "workspace.tool.column" },
  { toolId: "comment", png: "comment", labelKey: "workspace.tool.comment" },
  { toolId: "more",    png: "more" },
];

const TRASH: Item = {
  toolId: "trash",
  png: "trash",
  labelKey: "workspace.tool.trash",
};

export function Sidebar({ onSignalsClick }: { onSignalsClick?: () => void }) {
  const t = useT();
  const [activeId, setActiveId] = useState<ToolId>("text");
  const setSidebarDrag = useWorkspace((s) => s.setSidebarDrag);
  const addCardAt = useWorkspace((s) => s.addCardAt);
  const promoteCardToNewBoard = useWorkspace((s) => s.promoteCardToNewBoard);
  // FEAT-markdown-memo-pen: 펜 도구 = 펜 모드 토글.
  const penMode = useWorkspace((s) => s.penMode);
  const togglePenMode = useWorkspace((s) => s.togglePenMode);
  const pushToast = useToasts((s) => s.push);

  /**
   * mouseup 위치가 캔버스 위면 그 위치에 카드를 만든다. 캔버스 밖이면 no-op (취소).
   * 시스템 보드에서는 기존 Canvas.onDrop과 동일한 토스트 동작을 유지한다.
   * Canvas DOM은 `data-canvas-root="true"` 마커로 식별.
   */
  const tryDrop = useCallback(
    (toolId: ToolId, clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const canvasEl = el?.closest<HTMLElement>("[data-canvas-root='true']");
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const viewport = useWorkspace.getState().viewport;
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const wx = (sx - viewport.x) / viewport.scale - 120;
      const wy = (sy - viewport.y) / viewport.scale - 20;
      const newCardId = addCardAt(toolId, wx, wy);
      if (useWorkspace.getState().currentBoardId === SYSTEM_BOARD_ID) {
        pushToast({
          tone: "calm",
          title: t("workspace.system.drop.toastTitle"),
          body: t("workspace.system.drop.toastBody"),
          duration: 6000,
          action: {
            label: t("workspace.system.drop.newBoard"),
            onClick: async () => {
              await promoteCardToNewBoard(newCardId);
            },
          },
        });
      }
    },
    [addCardAt, promoteCardToNewBoard, pushToast, t],
  );

  /**
   * 정적 t() 호출 — check-i18n.mjs가 동적 키를 추적하지 못해도 누락 검출이 작동하도록.
   */
  const LABELS: Record<string, string> = {
    "capture.tool.text": t("capture.tool.text"),
    "capture.tool.checklist": t("capture.tool.checklist"),
    "capture.tool.image": t("capture.tool.image"),
    "capture.tool.link": t("capture.tool.link"),
    "capture.tool.code": t("capture.tool.code"),
    "capture.tool.highlight": t("capture.tool.highlight"),
    "capture.tool.audio": t("capture.tool.audio"),
    "capture.tool.handwriting": t("capture.tool.handwriting"),
    "capture.tool.mindmap": t("capture.tool.mindmap"),
    "capture.tool.file": t("capture.tool.file"),
    "workspace.tool.line": t("workspace.tool.line"),
    "workspace.tool.board": t("workspace.tool.board"),
    "workspace.tool.column": t("workspace.tool.column"),
    "workspace.tool.comment": t("workspace.tool.comment"),
    "workspace.tool.pen": t("workspace.tool.pen"),
    "workspace.tool.trash": t("workspace.tool.trash"),
  };
  const labelFor = (key?: string) => (key ? LABELS[key] : undefined);

  return (
    <aside className="flex h-full flex-col items-center overflow-y-auto bg-panel py-3 shadow-[1px_0_0_rgba(0,0,0,0.06)]">
      <div className="flex flex-col items-center">
        {CAPTURE_GROUP.map((item) => (
          <SidebarItem
            key={item.toolId}
            item={item}
            label={labelFor(item.labelKey)}
            active={item.toolId === activeId}
            onClick={() => setActiveId(item.toolId)}
            draggable
            setSidebarDrag={setSidebarDrag}
            onDrop={tryDrop}
          />
        ))}
      </div>

      <div className="my-2.5 h-px w-8 bg-border" />

      <div className="flex flex-col items-center">
        {CANVAS_GROUP.map((item) => (
          <SidebarItem
            key={item.toolId}
            item={item}
            label={labelFor(item.labelKey)}
            active={item.toolId === "pen" ? penMode : item.toolId === activeId}
            onClick={() => {
              if (item.toolId === "pen") {
                togglePenMode();
                return;
              }
              setActiveId(item.toolId);
            }}
          />
        ))}
      </div>

      <div className="my-2.5 h-px w-8 bg-border" />

      <SignalsSidebarItem
        label={t("signals.sidebar.label")}
        onClick={() => onSignalsClick?.()}
      />

      <div className="flex-1" />

      <SidebarItem
        item={TRASH}
        label={labelFor(TRASH.labelKey)}
        active={TRASH.toolId === activeId}
        onClick={() => setActiveId(TRASH.toolId)}
      />
    </aside>
  );
}

function SignalsSidebarItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group flex w-[132px] flex-col items-center px-1 pt-1 pb-1 outline-none"
    >
      <span
        className="relative flex h-[80px] w-[80px] items-center justify-center transition-transform duration-200 group-hover:scale-[1.05] group-hover:-translate-y-[1px]"
        style={{
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
        }}
      >
        <Image
          src={iconSrc("signals")}
          alt={label}
          width={80}
          height={80}
          priority
          unoptimized
          draggable={false}
          className="select-none object-contain h-full w-full"
        />
      </span>
      <span className="mt-1 text-[11px] leading-none text-text-muted">{label}</span>
    </button>
  );
}

function SidebarItem({
  item,
  label,
  active,
  onClick,
  draggable: dragEnabled = false,
  setSidebarDrag,
  onDrop,
}: {
  item: Item;
  label?: string;
  active: boolean;
  onClick: () => void;
  /** true면 마우스로 끌어 카드 생성에 사용. capture 도구에만 적용. */
  draggable?: boolean;
  setSidebarDrag?: (s: { toolId: ToolId; screenX: number; screenY: number } | null) => void;
  onDrop?: (toolId: ToolId, clientX: number, clientY: number) => void;
}) {
  const ariaLabel = label ?? item.toolId;
  const Svg = item.svg;
  /** mousedown 후 임계 거리를 넘긴 적이 있는지 — 다음 click을 흡수할지 결정. */
  const draggedRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!dragEnabled || !setSidebarDrag || e.button !== 0) return;
    e.preventDefault(); // text-select 회피
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    draggedRef.current = false;

    const onMove = (ev: MouseEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= DRAG_THRESHOLD) return;
        started = true;
        draggedRef.current = true;
      }
      setSidebarDrag({ toolId: item.toolId, screenX: ev.clientX, screenY: ev.clientY });
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey);
    };

    const onUp = (ev: MouseEvent) => {
      cleanup();
      if (!started) return; // 단순 클릭 — onClick에 위임
      setSidebarDrag(null);
      onDrop?.(item.toolId, ev.clientX, ev.clientY);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      cleanup();
      setSidebarDrag(null);
      // ESC로 취소했어도 mouseup이 바로 뒤따르면 click이 발화한다 — 흡수.
      draggedRef.current = true;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey);
  };

  const handleClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <button
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className="group flex w-[132px] flex-col items-center px-1 pt-1 pb-1 cursor-grab active:cursor-grabbing outline-none"
    >
      <span
        className={[
          "relative flex h-[80px] w-[80px] items-center justify-center transition-transform duration-200",
          active
            ? "scale-[1.12] -translate-y-[2px]"
            : "group-hover:scale-[1.05] group-hover:-translate-y-[1px]",
        ].join(" ")}
        style={{
          filter: active
            ? "drop-shadow(0 4px 8px rgba(0,0,0,0.18)) drop-shadow(0 1px 2px rgba(0,0,0,0.12))"
            : "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
          color: active ? "var(--color-text)" : "var(--color-text-muted)",
        }}
      >
        {Svg ? (
          <Svg size={44} />
        ) : item.png ? (
          <Image
            src={iconSrc(item.png)}
            alt={ariaLabel}
            width={40}
            height={40}
            priority
            unoptimized
            draggable={false}
            className="select-none object-contain h-full w-full"
          />
        ) : null}
      </span>
      {label && (
        <span
          className={[
            "mt-1 text-[11px] leading-none transition-colors",
            active ? "font-semibold text-text" : "text-text-muted",
          ].join(" ")}
        >
          {label}
        </span>
      )}
    </button>
  );
}

/** T-6 단축키에서 인덱스 → ToolId 매핑 시 사용. */
export const sidebarCaptureOrder = CAPTURE_TOOLS;
