"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FRAME_DEFAULT_WIDTH,
  SYSTEM_BOARD_ID,
  useWorkspace,
  widthForKind,
  type ToolId,
} from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";
import { layout } from "@/design/tokens";

/** 드래그로 인정하기 위한 최소 이동 거리 — 단순 클릭과 구분. */
const DRAG_THRESHOLD = 4;

/** FEAT-sticky-redesign §4: 캔버스 폭이 이보다 좁으면 독 확대를 끈다. */
const MIN_MAGNIFY_CANVAS_WIDTH = 360;

/** 시그널스 패널 폭(§4·SignalsPanel.tsx PANEL_WIDTH와 동일). */
const SIGNALS_PANEL_WIDTH = 420;

/**
 * 줌 바·펜 툴바가 화면 오른쪽 아래에 차지하는 대략의 폭 — 독이 이 영역과
 * 겹치면 왼쪽으로 비켜난다(§4 레이아웃). 두 툴바를 각각 측정하는 대신
 * 두 툴바를 합친 최대치를 여유 있게 잡는다(펜 툴바가 열리면 더 넓어진다).
 */
const RIGHT_TOOLBAR_RESERVED = 210;
const EDGE_MARGIN = 12;

/** 이웃 아이콘 확대가 0으로 꺼지는 거리(px). 맥 독 확대 falloff 반경. */
const MAGNIFY_SPREAD = 90;
/** 이 거리 안에 있는 아이콘만 이름표를 보여준다("hover한 그 아이콘"만). */
const LABEL_THRESHOLD = 30;

type DockToolId = ToolId | "signals";

type DockItem = {
  toolId: DockToolId;
  icon: string;
  labelKey: string;
  /** true면 마우스로 끌어 캔버스에 생성 — 나머지(pen·signals)는 클릭 전용. */
  draggable: boolean;
};

const DOCK_ITEMS: DockItem[] = [
  { toolId: "frame", icon: "/icons/dock/memoboard.png", labelKey: "workspace.tool.frame", draggable: true },
  { toolId: "text", icon: "/icons/dock/memo.png", labelKey: "capture.tool.text", draggable: true },
  { toolId: "board", icon: "/icons/dock/filebox.png", labelKey: "workspace.tool.board", draggable: true },
  { toolId: "pen", icon: "/icons/sidebar/draw-v2.png", labelKey: "workspace.tool.pen", draggable: false },
  { toolId: "signals", icon: "/icons/sidebar/signals-v2.png", labelKey: "signals.sidebar.label", draggable: false },
];

/** id별 확대 크기 — hover 중이 아니면 빈 객체(모두 기본 40px). */
interface Magnify {
  sizes: Partial<Record<DockToolId, number>>;
  hoveredId: DockToolId | null;
}

const NO_MAGNIFY: Magnify = { sizes: {}, hoveredId: null };

/**
 * FEAT-sticky-redesign n8: 화면 아래 가운데 독.
 * 왼쪽 사이드바(Sidebar.tsx)를 대체 — tryDrop 좌표 변환·시스템 보드 토스트를
 * 이식했다. 순서: 메모판·메모·파일함 | 구분선 | 펜·시그널스 (spec §2).
 *
 * 독 드래그는 Sidebar.tsx와 동일하게 raw mouse event(mousedown/mousemove/mouseup)로
 * 구현한다 — HTML5 draggable/dataTransfer API를 쓰지 않으므로 Canvas.tsx의 OS 파일
 * 드롭(dataTransfer.types에 "Files") 경로와 이벤트가 전혀 겹치지 않는다.
 */
export function Dock({
  onSignalsClick,
  signalsOpen = false,
}: {
  onSignalsClick?: () => void;
  /** §4: 시그널스 패널이 열리면 독은 남은 캔버스 폭(패널 420px 제외)의 가운데로. */
  signalsOpen?: boolean;
}) {
  const t = useT();
  const setSidebarDrag = useWorkspace((s) => s.setSidebarDrag);
  const addCardAt = useWorkspace((s) => s.addCardAt);
  const addCardAtViewportCenter = useWorkspace((s) => s.addCardAtViewportCenter);
  const addFrameAt = useWorkspace((s) => s.addFrameAt);
  const createSubcanvas = useWorkspace((s) => s.createSubcanvas);
  const promoteCardToNewBoard = useWorkspace((s) => s.promoteCardToNewBoard);
  const penMode = useWorkspace((s) => s.penMode);
  const togglePenMode = useWorkspace((s) => s.togglePenMode);
  const cards = useWorkspace((s) => s.cards);
  const viewport = useWorkspace((s) => s.viewport);
  const pushToast = useToasts((s) => s.push);

  const dockRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  const [dockHover, setDockHover] = useState(false);
  const [magnify, setMagnify] = useState<Magnify>(NO_MAGNIFY);
  const [occluded, setOccluded] = useState(false);

  /* ─ 화면 폭 추적 — 360px 미만이면 확대를 끈다 ─ */
  useEffect(() => {
    const onResize = () => setCanvasWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ─ prefers-reduced-motion — 켜져 있으면 확대 애니메이션을 끄고 이름표만 ─ */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const effectiveCanvasWidth = signalsOpen ? canvasWidth - SIGNALS_PANEL_WIDTH : canvasWidth;
  // §4: 캔버스가 좁으면(<360px) hover 추적 자체를 끈다(이름표도 없음).
  // 동작 줄이기(prefers-reduced-motion)는 hover는 추적하되 크기 확대만 끈다(이름표는 유지).
  const hoverTrackingEnabled = effectiveCanvasWidth >= MIN_MAGNIFY_CANVAS_WIDTH;
  const sizingEnabled = hoverTrackingEnabled && !reducedMotion;

  /* ─ 가려짐(AC-5): 독의 화면 영역과 겹치는 카드가 있으면 옅어진다 ─ */
  useEffect(() => {
    const dockEl = dockRef.current;
    if (!dockEl) return;
    const dockBox = dockEl.getBoundingClientRect();
    let hit = false;
    for (const card of cards) {
      if (card.kind === "frame") continue; // 판 자체는 옅어짐 판정 대상이 아니다(카드만).
      const left = viewport.x + card.x * viewport.scale;
      const top = viewport.y + card.y * viewport.scale;
      const height = card.height ?? widthForKind(card.kind);
      const right = left + card.width * viewport.scale;
      const bottom = top + height * viewport.scale;
      if (
        right >= dockBox.left &&
        left <= dockBox.right &&
        bottom >= dockBox.top &&
        top <= dockBox.bottom
      ) {
        hit = true;
        break;
      }
    }
    setOccluded(hit);
  }, [cards, viewport, canvasWidth]);

  /** 맥 독 확대 — 이웃 아이콘과의 거리에 따라 40~72px 사이로 보간한다. 이벤트 핸들러에서만 DOM을 측정한다. */
  /**
   * dockRef 아래 [data-dock-id] 버튼들을 이벤트 핸들러 안에서만 조회한다(렌더 중 ref
   * 접근 금지 — react-hooks/refs). 개별 버튼에 ref를 따로 걸지 않고 data 속성으로 식별.
   */
  const computeMagnify = useCallback(
    (clientX: number): Magnify => {
      if (!hoverTrackingEnabled || !dockRef.current) return NO_MAGNIFY;
      const base = layout.dock.iconBase;
      const hover = layout.dock.iconHover;
      const sizes: Partial<Record<DockToolId, number>> = {};
      let hoveredId: DockToolId | null = null;
      let bestDistance = Infinity;
      const buttons = dockRef.current.querySelectorAll<HTMLButtonElement>("button[data-dock-id]");
      buttons.forEach((btn) => {
        const id = btn.dataset.dockId as DockToolId;
        const rect = btn.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const distance = Math.abs(clientX - center);
        if (sizingEnabled) {
          const tt = Math.max(0, 1 - distance / MAGNIFY_SPREAD);
          sizes[id] = base + (hover - base) * tt;
        }
        if (distance < bestDistance) {
          bestDistance = distance;
          hoveredId = id;
        }
      });
      return { sizes, hoveredId: bestDistance <= LABEL_THRESHOLD ? hoveredId : null };
    },
    [hoverTrackingEnabled, sizingEnabled],
  );

  const handleDockMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setMagnify(computeMagnify(e.clientX));
  };
  const handleDockMouseLeave = () => {
    setDockHover(false);
    setMagnify(NO_MAGNIFY);
  };

  /**
   * mouseup 위치가 캔버스 위면 그 위치에 카드/판/함을 만든다. 캔버스 밖(독 위 포함)이면 no-op.
   * Sidebar.tsx의 tryDrop을 그대로 이식 — 좌표 변환·시스템 보드 토스트 동일.
   */
  const tryDrop = useCallback(
    (toolId: ToolId, clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const canvasEl = el?.closest<HTMLElement>("[data-canvas-root='true']");
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const viewportNow = useWorkspace.getState().viewport;
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const wx = (sx - viewportNow.x) / viewportNow.scale - 120;
      const wy = (sy - viewportNow.y) / viewportNow.scale - 20;

      if (toolId === "frame") {
        addFrameAt(wx, wy);
        return;
      }
      if (toolId === "board") {
        createSubcanvas(wx, wy);
        return;
      }

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
    [addCardAt, addFrameAt, createSubcanvas, promoteCardToNewBoard, pushToast, t],
  );

  /** 클릭(또는 Enter) — 화면 가운데에 생성. 접근성 §8: 키보드만으로 생성 가능해야 한다. */
  const createAtCenter = useCallback(
    (toolId: DockToolId) => {
      if (toolId === "text") {
        addCardAtViewportCenter("text");
        return;
      }
      const v = useWorkspace.getState().viewport;
      const w = typeof window !== "undefined" ? window.innerWidth : 1280;
      const h = typeof window !== "undefined" ? window.innerHeight : 800;
      const sx = w / 2;
      const sy = h / 2;
      if (toolId === "frame") {
        const wx = (sx - v.x) / v.scale - FRAME_DEFAULT_WIDTH / 2;
        const wy = (sy - v.y) / v.scale - 20;
        addFrameAt(wx, wy);
        return;
      }
      if (toolId === "board") {
        const wx = (sx - v.x) / v.scale - widthForKind("board") / 2;
        const wy = (sy - v.y) / v.scale - 20;
        createSubcanvas(wx, wy);
      }
    },
    [addCardAtViewportCenter, addFrameAt, createSubcanvas],
  );

  const LABELS: Record<string, string> = {
    "workspace.tool.frame": t("workspace.tool.frame"),
    "capture.tool.text": t("capture.tool.text"),
    "workspace.tool.board": t("workspace.tool.board"),
    "workspace.tool.pen": t("workspace.tool.pen"),
    "signals.sidebar.label": t("signals.sidebar.label"),
  };

  /* ─ 레이아웃: 남은 캔버스 폭 가운데 + 줌 바/펜 툴바 회피 ─ */
  let centerX = effectiveCanvasWidth / 2;
  const rightEdge = effectiveCanvasWidth - RIGHT_TOOLBAR_RESERVED;
  if (centerX + layout.dock.width / 2 > rightEdge) {
    centerX = rightEdge - layout.dock.width / 2;
  }
  centerX = Math.max(layout.dock.width / 2 + EDGE_MARGIN, centerX);
  const dockLeft = centerX - layout.dock.width / 2;

  return (
    <div
      ref={dockRef}
      role="toolbar"
      aria-label={t("workspace.dock.label")}
      onMouseEnter={() => setDockHover(true)}
      onMouseLeave={handleDockMouseLeave}
      onMouseMove={handleDockMouseMove}
      className="fixed z-[var(--z-panel)] flex items-center gap-1 rounded-full px-3"
      style={{
        left: dockLeft,
        bottom: layout.dock.bottomMargin,
        height: layout.dock.height,
        background: "var(--gradient-paper)",
        boxShadow: "var(--shadow-card)",
        opacity: occluded && !dockHover ? 0.6 : 1,
        transition: "opacity 180ms ease",
      }}
    >
      {DOCK_ITEMS.slice(0, 3).map((item) => (
        <DockButton
          key={item.toolId}
          item={item}
          label={LABELS[item.labelKey]}
          size={magnify.sizes[item.toolId]}
          showLabel={magnify.hoveredId === item.toolId}
          reducedMotion={reducedMotion}
          onDragStart={(screenX, screenY) =>
            setSidebarDrag({ toolId: item.toolId as ToolId, screenX, screenY })
          }
          onDragMove={(screenX, screenY) =>
            setSidebarDrag({ toolId: item.toolId as ToolId, screenX, screenY })
          }
          onDragEnd={() => setSidebarDrag(null)}
          onDrop={(toolId, x, y) => tryDrop(toolId as ToolId, x, y)}
          onClick={() => createAtCenter(item.toolId)}
        />
      ))}

      <div className="mx-1 h-6 w-px bg-border" aria-hidden />

      <DockButton
        item={DOCK_ITEMS[3]}
        label={LABELS[DOCK_ITEMS[3].labelKey]}
        size={magnify.sizes.pen}
        showLabel={magnify.hoveredId === "pen"}
        reducedMotion={reducedMotion}
        pressed={penMode}
        onClick={() => togglePenMode()}
      />

      <DockButton
        item={DOCK_ITEMS[4]}
        label={LABELS[DOCK_ITEMS[4].labelKey]}
        size={magnify.sizes.signals}
        showLabel={magnify.hoveredId === "signals"}
        reducedMotion={reducedMotion}
        onClick={() => onSignalsClick?.()}
      />
    </div>
  );
}

function DockButton({
  item,
  label,
  size,
  showLabel,
  reducedMotion,
  pressed,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDrop,
  onClick,
}: {
  item: DockItem;
  label: string;
  /** 확대된 크기(px). undefined면 hover 중이 아님 — 기본 40px. */
  size?: number;
  showLabel: boolean;
  reducedMotion: boolean;
  pressed?: boolean;
  onDragStart?: (screenX: number, screenY: number) => void;
  onDragMove?: (screenX: number, screenY: number) => void;
  onDragEnd?: () => void;
  onDrop?: (toolId: DockToolId, clientX: number, clientY: number) => void;
  onClick: () => void;
}) {
  const draggedRef = useRef(false);
  const displaySize = size ?? layout.dock.iconBase;

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onDragStart || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    draggedRef.current = false;

    const onMove = (ev: MouseEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= DRAG_THRESHOLD) return;
        started = true;
        draggedRef.current = true;
        onDragStart(ev.clientX, ev.clientY);
      }
      onDragMove?.(ev.clientX, ev.clientY);
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey);
    };

    const onUp = (ev: MouseEvent) => {
      cleanup();
      if (!started) return; // 단순 클릭 — onClick에 위임
      onDragEnd?.();
      onDrop?.(item.toolId, ev.clientX, ev.clientY);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      cleanup();
      onDragEnd?.();
      // Esc로 취소했어도 mouseup이 바로 뒤따르면 click이 발화한다 — 흡수(생성 없음).
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
      type="button"
      data-dock-id={item.toolId}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={label}
      aria-pressed={pressed}
      className="group relative flex flex-col items-center justify-center outline-none"
      style={{ width: layout.dock.iconHover, height: layout.dock.iconHover }}
    >
      <span
        className="relative flex items-center justify-center"
        style={{
          width: displaySize,
          height: displaySize,
          transition: reducedMotion ? "none" : "width 150ms ease, height 150ms ease",
          filter: pressed
            ? "drop-shadow(0 4px 8px rgba(0,0,0,0.18))"
            : "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
        }}
      >
        <Image
          src={item.icon}
          alt={label}
          width={88}
          height={88}
          priority
          unoptimized
          draggable={false}
          className="select-none object-contain h-full w-full"
        />
      </span>
      {showLabel && (
        <span className="absolute -bottom-1 whitespace-nowrap text-[11px] leading-none text-text-muted">
          {label}
        </span>
      )}
    </button>
  );
}
