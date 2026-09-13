"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  kindForTool,
  SYSTEM_BOARD_ID,
  useWorkspace,
  widthForKind,
  type Card,
  type ToolId,
} from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";
import { layout } from "@/design/tokens";
import { PANEL_WIDTH as SIGNALS_PANEL_WIDTH } from "@/components/signals/SignalsPanel";

/** 드래그로 인정하기 위한 최소 이동 거리 — 단순 클릭과 구분. */
const DRAG_THRESHOLD = 4;

/** FEAT-sticky-redesign §4: 캔버스 폭이 이보다 좁으면 독 확대를 끈다. */
const MIN_MAGNIFY_CANVAS_WIDTH = 360;

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
 * 2단계 리뷰 P1-2: 카드 하나가 독 화면 영역(dockRect)과 겹치는지 순수 함수로
 * 판정한다(AC-5). 판(frame) 카드는 배경 레이어라 대상에서 제외(n8 구현 메모).
 * Dock 컴포넌트 밖에서도 단위 테스트할 수 있도록 export한다.
 *
 * n10 브라우저 결함1: 이 계산은 world-layer가 화면(0,0)에서 시작한다고
 * 가정한다 — 실제로는 캔버스 루트 자신의 화면 오프셋(canvasOffset)만큼 더
 * 밀려 있을 수 있다(레이아웃에 따라 캔버스가 왼쪽 끝에서 시작하지 않는
 * 경우, 또는 카드가 실측 DOM과 다른 폭/높이로 렌더된 경우). Dock 컴포넌트는
 * 이 순수 함수를 "실제 DOM에 카드가 없을 때"의 폴백으로만 쓰고, 렌더된
 * 카드가 있으면 실제 getBoundingClientRect를 우선한다(아래 recompute).
 */
export function cardOccludesDock(
  card: Card,
  viewport: { x: number; y: number; scale: number },
  dockRect: { left: number; right: number; top: number; bottom: number },
  canvasOffset: { left: number; top: number } = { left: 0, top: 0 },
): boolean {
  if (card.kind === "frame") return false;
  const left = canvasOffset.left + viewport.x + card.x * viewport.scale;
  const top = canvasOffset.top + viewport.y + card.y * viewport.scale;
  const height = card.height ?? widthForKind(card.kind);
  const right = left + card.width * viewport.scale;
  const bottom = top + height * viewport.scale;
  return (
    right >= dockRect.left &&
    left <= dockRect.right &&
    bottom >= dockRect.top &&
    top <= dockRect.bottom
  );
}

/** 화면(getBoundingClientRect) 사각형 두 개가 겹치는지 — 실측 DOM 기반 판정용. */
function domRectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

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
  const setDockDrag = useWorkspace((s) => s.setDockDrag);
  const addCardAt = useWorkspace((s) => s.addCardAt);
  const addCardAtViewportCenter = useWorkspace((s) => s.addCardAtViewportCenter);
  const addFrameAt = useWorkspace((s) => s.addFrameAt);
  const addFrameAtViewportCenter = useWorkspace((s) => s.addFrameAtViewportCenter);
  const createSubcanvas = useWorkspace((s) => s.createSubcanvas);
  const createSubcanvasAtViewportCenter = useWorkspace((s) => s.createSubcanvasAtViewportCenter);
  const promoteCardToNewBoard = useWorkspace((s) => s.promoteCardToNewBoard);
  const penMode = useWorkspace((s) => s.penMode);
  const togglePenMode = useWorkspace((s) => s.togglePenMode);
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
  // 2단계 리뷰 P1-1: 독 실제 렌더 폭(레이아웃 토큰은 근사치일 뿐 — 버튼 슬롯이
  // hover로 커지면 실제 폭도 달라진다). 가운데 정렬·툴바 회피는 이 실측값을 쓴다.
  const [dockWidth, setDockWidth] = useState<number>(layout.dock.width);
  // 확대 중에는 폭 실측을 반영하지 않는다 — 커진 폭으로 가운데를 다시 잡으면 독이
  // 커서 아래에서 옆으로 밀려 hover 대상이 바뀌고 확대가 출렁인다. 확대가 끝나 줄어들면
  // ResizeObserver가 다시 불려 기본 폭으로 맞춰진다.
  const magnifyingRef = useRef(false);

  /* ─ 화면 폭 추적 — 360px 미만이면 확대를 끈다 ─ */
  useEffect(() => {
    const onResize = () => {
      // 재심사 P1: 터치 탭은 mousemove만 합성하고 mouseleave가 안 온다 → 확대 표시가
      // 남으면 폭 실측이 영구 스킵된다. 레이아웃이 바뀌는 시점에 확대 상태를 푼다.
      magnifyingRef.current = false;
      setCanvasWidth(window.innerWidth);
    };
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

  /* ─ 독 실제 폭 실측(2단계 리뷰 P1-1) ─ */
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      const w = el.getBoundingClientRect().width;
      if (w) setDockWidth(w);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      if (magnifyingRef.current) return;
      const w = entries[0]?.contentRect.width;
      if (w) setDockWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveCanvasWidth = signalsOpen ? canvasWidth - SIGNALS_PANEL_WIDTH : canvasWidth;
  // §4: 캔버스가 좁으면(<360px) hover 추적 자체를 끈다(이름표도 없음).
  // 동작 줄이기(prefers-reduced-motion)는 hover는 추적하되 크기 확대만 끈다(이름표는 유지).
  const hoverTrackingEnabled = effectiveCanvasWidth >= MIN_MAGNIFY_CANVAS_WIDTH;
  const sizingEnabled = hoverTrackingEnabled && !reducedMotion;

  /* ─ 가려짐(AC-5): 독의 화면 영역과 겹치는 카드가 있으면 옅어진다(2단계 리뷰 P1-2)
   * — 순수 함수(cardOccludesDock) + useWorkspace.subscribe로 직접 구독하고
   * rAF로 스로틀한다(cards·viewport를 훅으로 구독하면 effect deps에서 독 자체
   * 위치가 바뀌는 계기인 signalsOpen·effectiveCanvasWidth를 빠뜨리기 쉽다).
   * 값이 실제로 바뀔 때만 setOccluded를 불러 불필요한 리렌더를 막는다. */
  useEffect(() => {
    let rafId = 0;
    let scheduled = false;
    const recompute = () => {
      scheduled = false;
      const dockEl = dockRef.current;
      if (!dockEl) return;
      const dockBox = dockEl.getBoundingClientRect();
      const state = useWorkspace.getState();
      // n10 결함1: 캔버스 루트가 화면 (0,0)에서 시작하지 않을 수 있다 — 실측
      // 오프셋을 폴백 계산에 더한다(카드가 아직 DOM에 없을 때만 쓰인다).
      const canvasEl = document.querySelector<HTMLElement>("[data-canvas-root='true']");
      const canvasOffset = canvasEl
        ? { left: canvasEl.getBoundingClientRect().left, top: canvasEl.getBoundingClientRect().top }
        : { left: 0, top: 0 };
      const hit = state.cards.some((c) => {
        if (c.kind === "frame") return false;
        // 실제 렌더된 카드 DOM이 있으면 그 실측 rect를 우선한다 — 캔버스 오프셋·
        // 실제 높이(auto-grow)·round 등 어떤 근사도 필요 없이 정확하다.
        const cardEl = document.querySelector<HTMLElement>(`[data-card-id="${c.id}"]`);
        if (cardEl) return domRectsOverlap(cardEl.getBoundingClientRect(), dockBox);
        return cardOccludesDock(c, state.viewport, dockBox, canvasOffset);
      });
      setOccluded((prev) => (prev === hit ? prev : hit));
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      rafId = requestAnimationFrame(recompute);
    };
    recompute(); // 초기 1회는 즉시(마운트 직후 테스트도 동기적으로 통과해야 한다).
    const unsubscribe = useWorkspace.subscribe(schedule);
    return () => {
      unsubscribe();
      if (rafId) cancelAnimationFrame(rafId);
    };
    // 독 위치(따라서 dockRect)가 바뀌는 계기 — 시그널스 열림/닫힘, 캔버스 폭 변화.
  }, [signalsOpen, effectiveCanvasWidth, dockWidth]);

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

  // 시그널스 패널 토글로 독 위치가 바뀔 때도 확대 상태를 푼다(위 onResize와 같은 이유).
  useEffect(() => {
    magnifyingRef.current = false;
  }, [signalsOpen]);

  const handleDockMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const next = computeMagnify(e.clientX);
    magnifyingRef.current = Object.keys(next.sizes).length > 0;
    setMagnify(next);
  };
  const handleDockMouseLeave = () => {
    magnifyingRef.current = false;
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
      // 2단계 리뷰 P1-4: kind별 실제 폭의 절반만큼 빼야 드롭 위치가 드래그 프리뷰
      // 중심과 일치한다(예전엔 세 kind 모두 -120 하나로 고정 — frame(320폭)·board
      // (200폭)에서는 중심이 어긋났다).
      const halfWidth = widthForKind(kindForTool(toolId)) / 2;
      const wx = (sx - viewportNow.x) / viewportNow.scale - halfWidth;
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

  /**
   * 클릭(또는 Enter) — 화면 가운데에 생성. 접근성 §8: 키보드만으로 생성 가능해야 한다.
   * 2단계 리뷰 P1-4: 중심 좌표 계산을 스토어(addFrameAtViewportCenter·
   * createSubcanvasAtViewportCenter)로 옮겨 addCardAtViewportCenter와 같은 자리에
   * 모았다 — Dock은 호출만 한다(좌표 계산 중복 제거).
   */
  const createAtCenter = useCallback(
    (toolId: DockToolId) => {
      if (toolId === "text") {
        addCardAtViewportCenter("text");
        return;
      }
      if (toolId === "frame") {
        addFrameAtViewportCenter();
        return;
      }
      if (toolId === "board") {
        createSubcanvasAtViewportCenter();
      }
    },
    [addCardAtViewportCenter, addFrameAtViewportCenter, createSubcanvasAtViewportCenter],
  );

  const LABELS: Record<string, string> = {
    "workspace.tool.frame": t("workspace.tool.frame"),
    "capture.tool.text": t("capture.tool.text"),
    "workspace.tool.board": t("workspace.tool.board"),
    "workspace.tool.pen": t("workspace.tool.pen"),
    "signals.sidebar.label": t("signals.sidebar.label"),
  };

  /* ─ 레이아웃: 남은 캔버스 폭 가운데 + 줌 바/펜 툴바 회피 ─
   * 2단계 리뷰 P1-1: layout.dock.width(고정 토큰) 대신 dockWidth(실측)로 계산 —
   * 버튼 슬롯이 평상시 iconBase(40px)이고 hover로만 커지므로 실제 폭은 토큰의
   * 근사치일 뿐이다. */
  let centerX = effectiveCanvasWidth / 2;
  const rightEdge = effectiveCanvasWidth - RIGHT_TOOLBAR_RESERVED;
  if (centerX + dockWidth / 2 > rightEdge) {
    centerX = rightEdge - dockWidth / 2;
  }
  centerX = Math.max(dockWidth / 2 + EDGE_MARGIN, centerX);
  const dockLeft = centerX - dockWidth / 2;

  return (
    <div
      ref={dockRef}
      role="toolbar"
      aria-label={t("workspace.dock.label")}
      onMouseEnter={() => setDockHover(true)}
      onMouseLeave={handleDockMouseLeave}
      onMouseMove={handleDockMouseMove}
      onTouchStart={() => {
        // 터치에는 hover가 없다 — 합성 mousemove가 남긴 확대 상태를 쓰지 않는다.
        magnifyingRef.current = false;
      }}
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
            setDockDrag({ toolId: item.toolId as ToolId, screenX, screenY })
          }
          onDragMove={(screenX, screenY) =>
            setDockDrag({ toolId: item.toolId as ToolId, screenX, screenY })
          }
          onDragEnd={() => setDockDrag(null)}
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
      window.removeEventListener("blur", onBlur);
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

    // 2단계 리뷰 P2: 창 밖에서 마우스를 놓으면(blur — 다른 창/탭으로 포커스 이동)
    // mouseup이 이 문서로 오지 않아 드래그 상태가 영구히 남는다 — 생성 없이 정리.
    const onBlur = () => {
      cleanup();
      if (!started) return;
      onDragEnd?.();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
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
      style={{
        // 2단계 리뷰 P1-1: 슬롯을 hover 크기(72px)로 고정하지 않는다 — 평상시
        // iconBase(40px)이고 hover 확대만큼만 늘어나야(맥 독처럼) 독 실제 폭이
        // layout.dock.width 근사치에 맞고 가운데 정렬이 어긋나지 않는다.
        width: displaySize,
        height: displaySize,
        transition: reducedMotion ? "none" : "width 150ms ease, height 150ms ease",
      }}
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
