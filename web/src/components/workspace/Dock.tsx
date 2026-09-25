"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  kindForTool,
  useWorkspace,
  widthForKind,
  type ToolId,
} from "@/state/workspace";
// import { useToasts } from "@/state/notifications"; // 무소속 토스트 숨김(2026-09-22)
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

/**
 * SSR 폴백 뷰포트 폭. 서버에는 window가 없으므로 클라이언트 첫 렌더도 이 값을 써야
 * 하이드레이션이 맞는다 — 실측값은 마운트 후 effect에서 반영한다(렌더 중 window 접근 금지).
 */
const FALLBACK_VIEWPORT_WIDTH = 1280;

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
  { toolId: "frame", icon: "/icons/dock/whiteboard.png", labelKey: "workspace.tool.frame", draggable: true },
  { toolId: "text", icon: "/icons/dock/memo.png", labelKey: "capture.tool.text", draggable: true },
  { toolId: "board", icon: "/icons/dock/filebox-folder.png", labelKey: "workspace.tool.board", draggable: true },
  { toolId: "pen", icon: "/icons/sidebar/draw-v2.png", labelKey: "workspace.tool.pen", draggable: false },
  { toolId: "signals", icon: "/icons/sidebar/signals-v2.png", labelKey: "signals.sidebar.label", draggable: false },
  // FEAT-trash: 독 맨 끝 휴지통 — 클릭 전용(카드를 끌어 위에 놓으면 버린다, FEAT-trash-drag).
  { toolId: "trash", icon: "/icons/sidebar/trash-v2.png", labelKey: "workspace.tool.trash", draggable: false },
];

/**
 * 호버 성능: 확대는 motion(구 framer-motion)의 MotionValue로 DOM style에 직접 쓴다 —
 * mousemove마다 React 렌더가 돌지 않는다(Build UI "Magnified Dock" 레시피 패턴).
 * 스프링은 거의 임계 감쇠(ζ≈1.03, ω≈63rad/s) — 이탈 후 약 100ms 안에 40px로 복귀(AC-2 200ms).
 */
const MAGNIFY_SPRING = { mass: 0.1, stiffness: 400, damping: 13 } as const;

/** 버튼 중심과 커서 거리(px) → 아이콘 크기(px). 거리 0이면 72, MAGNIFY_SPREAD 이상이면 40. */
export function magnifiedSize(distance: number): number {
  const base = layout.dock.iconBase;
  const hover = layout.dock.iconHover;
  if (!Number.isFinite(distance)) return base;
  const tt = Math.max(0, 1 - Math.abs(distance) / MAGNIFY_SPREAD);
  return base + (hover - base) * tt;
}

type Centers = Partial<Record<DockToolId, number>>;

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
  signalsOpen = false,
}: {
  /** 2026-09-19 사용자 결정: 시그널스 진입점 임시 숨김 — 버튼 복원 시 다시 사용. */
  onSignalsClick?: () => void;
  /** §4: 시그널스 패널이 열리면 독은 남은 캔버스 폭(패널 420px 제외)의 가운데로. */
  signalsOpen?: boolean;
}) {
  const t = useT();
  const setDockDrag = useWorkspace((s) => s.setDockDrag);
  const setTrashOpen = useWorkspace((s) => s.setTrashOpen);
  const trashCount = useWorkspace((s) => s.trashCount);
  // FEAT-trash-drag: 카드가 이 독의 휴지통 위에 있을 때 강조.
  const dropTargetTrash = useWorkspace((s) => s.dropTargetTrash);
  const addCardAt = useWorkspace((s) => s.addCardAt);
  const addCardAtViewportCenter = useWorkspace((s) => s.addCardAtViewportCenter);
  const addFrameAt = useWorkspace((s) => s.addFrameAt);
  const addFrameAtViewportCenter = useWorkspace((s) => s.addFrameAtViewportCenter);
  const createSubcanvas = useWorkspace((s) => s.createSubcanvas);
  const createSubcanvasAtViewportCenter = useWorkspace((s) => s.createSubcanvasAtViewportCenter);
  // 무소속 토스트와 함께 임시 숨김(2026-09-22).
  // const promoteCardToNewBoard = useWorkspace((s) => s.promoteCardToNewBoard);
  // 2026-09-19 사용자 결정: 펜·시그널스 진입점 임시 숨김 — 버튼 복원 시 함께 되살린다.
  // const penMode = useWorkspace((s) => s.penMode);
  // const togglePenMode = useWorkspace((s) => s.togglePenMode);
  // const pushToast = useToasts((s) => s.push);

  const dockRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(FALLBACK_VIEWPORT_WIDTH);
  const [reducedMotion, setReducedMotion] = useState(false);
  // 이름표를 보여줄 아이콘 — 바뀔 때만 setState(렌더). 크기는 아래 MotionValue가 맡는다.
  const [hoveredId, setHoveredId] = useState<DockToolId | null>(null);
  const hoveredRef = useRef<DockToolId | null>(null);
  /** 커서 x(화면 좌표). 독 밖·확대 꺼짐이면 Infinity → 모든 아이콘 기본 크기. */
  const mouseX = useMotionValue(Infinity);
  /** 버튼별 "평상시(확대 전) 레이아웃" 중심 x — enter·첫 move 때만 측정해 캐시한다. */
  const centers = useMotionValue<Centers>({});
  const centersValidRef = useRef(false);
  /** 버튼별 현재 크기 MotionValue — 측정 시 확대분을 빼 평상시 좌표로 되돌리는 데 쓴다. */
  const sizeValuesRef = useRef<Partial<Record<DockToolId, MotionValue<number>>>>({});
  // 2단계 리뷰 P1-1: 독 실제 렌더 폭(레이아웃 토큰은 근사치일 뿐 — 버튼 슬롯이
  // hover로 커지면 실제 폭도 달라진다). 가운데 정렬·툴바 회피는 이 실측값을 쓴다.
  const [dockWidth, setDockWidth] = useState<number>(layout.dock.width);
  // 확대 중에도 가운데 정렬 기준은 "평상시 폭"이다 — 커진 폭으로 가운데를 다시 잡으면
  // 독이 커서 아래에서 옆으로 밀려 hover 대상이 바뀌고 확대가 출렁인다. 실측 폭에서
  // 버튼들의 확대분(현재 크기 - 40)을 빼 평상시 폭을 구한다(확대·복귀 스프링 도중에도 left 고정).
  const restExtra = () => {
    let extra = 0;
    for (const mv of Object.values(sizeValuesRef.current)) {
      if (mv) extra += mv.get() - layout.dock.iconBase;
    }
    return extra;
  };

  /* ─ 화면 폭 추적 — 360px 미만이면 확대를 끈다 ─ */
  useEffect(() => {
    const onResize = () => {
      // 레이아웃이 바뀌면 캐시한 버튼 중심은 무효 — 다음 move에서 다시 잰다.
      centersValidRef.current = false;
      setCanvasWidth(window.innerWidth);
    };
    // 하이드레이션 첫 렌더는 서버와 같은 폴백을 쓴다 — 실측값은 여기(커밋 후)에서 반영.
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ─ prefers-reduced-motion — 켜져 있으면 확대 애니메이션을 끄고 이름표만 ─ */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    // 초기값도 effect에서 반영(렌더 중 window.matchMedia 접근 금지).
    onChange();
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
      const w = entries[0]?.contentRect.width;
      if (!w) return;
      // 0.5px 단위로 반올림 — 스프링 도중 소수점 흔들림으로 setState가 반복되지 않게.
      setDockWidth(Math.round((w - restExtra()) * 2) / 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveCanvasWidth = signalsOpen ? canvasWidth - SIGNALS_PANEL_WIDTH : canvasWidth;
  // §4: 캔버스가 좁으면(<360px) hover 추적 자체를 끈다(이름표도 없음).
  // 동작 줄이기(prefers-reduced-motion)는 hover는 추적하되 크기 확대만 끈다(이름표는 유지).
  const hoverTrackingEnabled = effectiveCanvasWidth >= MIN_MAGNIFY_CANVAS_WIDTH;
  const sizingEnabled = hoverTrackingEnabled && !reducedMotion;

  /**
   * 맥 독 확대 — 버튼 중심(평상시 레이아웃 기준)을 한 번 재서 캐시한다.
   * dockRef 아래 [data-dock-id] 버튼들을 이벤트 핸들러 안에서만 조회한다(렌더 중 ref
   * 접근 금지 — react-hooks/refs). 확대 도중 다시 재더라도 앞 버튼들의 확대분을 빼
   * 평상시 좌표로 되돌리므로 커서↔확대 피드백 출렁임이 없다.
   */
  const measureCenters = () => {
    const dockEl = dockRef.current;
    if (!dockEl) return;
    const base = layout.dock.iconBase;
    const next: Centers = {};
    let shift = 0;
    dockEl.querySelectorAll<HTMLButtonElement>("button[data-dock-id]").forEach((btn) => {
      const id = btn.dataset.dockId as DockToolId;
      const rect = btn.getBoundingClientRect();
      const extra = (sizeValuesRef.current[id]?.get() ?? base) - base;
      next[id] = rect.left + rect.width / 2 - shift - extra / 2;
      shift += extra;
    });
    centers.set(next);
    centersValidRef.current = true;
  };

  const registerSize = useCallback((id: DockToolId, mv: MotionValue<number> | null) => {
    if (mv) sizeValuesRef.current[id] = mv;
    else delete sizeValuesRef.current[id];
  }, []);

  // 시그널스 패널 토글·독 위치 변화 때도 캐시한 중심을 버린다(위 onResize와 같은 이유).
  useEffect(() => {
    centersValidRef.current = false;
  }, [signalsOpen, effectiveCanvasWidth, dockWidth]);

  // 확대가 꺼지면(reduced-motion 전환·좁은 캔버스) 커서 값을 치워 기본 크기로.
  useEffect(() => {
    if (!sizingEnabled) mouseX.set(Infinity);
  }, [sizingEnabled, mouseX]);

  const handleDockMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hoverTrackingEnabled) return;
    if (!centersValidRef.current) measureCenters();
    // 크기: MotionValue만 갱신 — React 렌더 없음.
    if (sizingEnabled) mouseX.set(e.clientX);
    // 이름표: 가장 가까운 아이콘이 LABEL_THRESHOLD 안이면 그 아이콘. 바뀔 때만 렌더.
    let best: DockToolId | null = null;
    let bestDistance = Infinity;
    for (const [id, c] of Object.entries(centers.get()) as [DockToolId, number][]) {
      const d = Math.abs(e.clientX - c);
      if (d < bestDistance) {
        bestDistance = d;
        best = id;
      }
    }
    const nextHovered = bestDistance <= LABEL_THRESHOLD ? best : null;
    // 같은 값이면 setState 자체를 부르지 않는다(React의 같은 값 bail-out도 한 번은 렌더를 돌 수 있다).
    if (hoveredRef.current !== nextHovered) {
      hoveredRef.current = nextHovered;
      setHoveredId(nextHovered);
    }
  };
  const handleDockMouseLeave = () => {
    mouseX.set(Infinity);
    hoveredRef.current = null;
    setHoveredId(null);
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

      addCardAt(toolId, wx, wy);
      // 임시 숨김(2026-09-22 사용자 결정): 시스템 보드에 메모를 놓을 때 뜨던
      // "이 메모는 무소속이에요 / 새 프로젝트" 토스트. 되돌리려면 주석을 푼다.
      // const newCardId = addCardAt(toolId, wx, wy);
      // if (useWorkspace.getState().currentBoardId === SYSTEM_BOARD_ID) {
      //   pushToast({
      //     tone: "calm",
      //     title: t("workspace.system.drop.toastTitle"),
      //     body: t("workspace.system.drop.toastBody"),
      //     duration: 6000,
      //     action: {
      //       label: t("workspace.system.drop.newBoard"),
      //       onClick: async () => {
      //         await promoteCardToNewBoard(newCardId);
      //       },
      //     },
      //   });
      // }
    },
    [addCardAt, addFrameAt, createSubcanvas],
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
    "workspace.tool.trash": t("workspace.tool.trash"),
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
      onMouseEnter={() => {
        centersValidRef.current = false;
      }}
      onMouseLeave={handleDockMouseLeave}
      onMouseMove={handleDockMouseMove}
      onTouchStart={() => {
        // 터치에는 hover가 없다 — 이전 합성 mousemove가 남긴 확대를 푼다.
        mouseX.set(Infinity);
        centersValidRef.current = false;
      }}
      className="fixed z-[var(--z-panel)] flex items-center gap-1 rounded-full px-3"
      style={{
        left: dockLeft,
        bottom: layout.dock.bottomMargin,
        height: layout.dock.height,
        background: "var(--gradient-paper)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {DOCK_ITEMS.slice(0, 3).map((item) => (
        <DockButton
          key={item.toolId}
          item={item}
          label={LABELS[item.labelKey]}
          mouseX={mouseX}
          centers={centers}
          registerSize={registerSize}
          showLabel={hoveredId === item.toolId}
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

      {/* FEAT-trash: 독 맨 끝 휴지통 — 클릭하면 패널, 메모가 있으면 점 배지. */}
      <DockButton
        item={DOCK_ITEMS.find((i) => i.toolId === "trash")!}
        label={LABELS["workspace.tool.trash"]}
        mouseX={mouseX}
        centers={centers}
        registerSize={registerSize}
        showLabel={hoveredId === "trash"}
        reducedMotion={reducedMotion}
        badge={trashCount > 0}
        dropTarget={dropTargetTrash}
        onClick={() => setTrashOpen(true)}
      />

      {/*
       * 2026-09-19 사용자 결정: 펜·시그널스 진입점 임시 숨김(삭제 아님).
       * 되돌리려면 이 블록의 주석을 풀고, 위 penMode·togglePenMode selector와
       * Dock의 onSignalsClick prop도 함께 복원한다.
      <div className="mx-1 h-6 w-px bg-border" aria-hidden />

      <DockButton
        item={DOCK_ITEMS[3]}
        label={LABELS[DOCK_ITEMS[3].labelKey]}
        mouseX={mouseX}
        centers={centers}
        registerSize={registerSize}
        showLabel={hoveredId === "pen"}
        reducedMotion={reducedMotion}
        pressed={penMode}
        onClick={() => togglePenMode()}
      />

      <DockButton
        item={DOCK_ITEMS[4]}
        label={LABELS[DOCK_ITEMS[4].labelKey]}
        mouseX={mouseX}
        centers={centers}
        registerSize={registerSize}
        showLabel={hoveredId === "signals"}
        reducedMotion={reducedMotion}
        onClick={() => onSignalsClick?.()}
      />
      */}
    </div>
  );
}

function DockButton({
  item,
  label,
  mouseX,
  centers,
  registerSize,
  showLabel,
  reducedMotion,
  pressed,
  badge,
  dropTarget,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDrop,
  onClick,
}: {
  item: DockItem;
  label: string;
  /** 커서 x — Dock이 mousemove마다 set한다(렌더 없음). */
  mouseX: MotionValue<number>;
  /** 버튼별 평상시 중심 x 캐시. */
  centers: MotionValue<Centers>;
  registerSize: (id: DockToolId, mv: MotionValue<number> | null) => void;
  showLabel: boolean;
  reducedMotion: boolean;
  pressed?: boolean;
  /** FEAT-trash: 점 배지 — 휴지통에 메모가 있을 때. */
  badge?: boolean;
  /** FEAT-trash-drag: 카드 드래그가 이 버튼 위에 있으면 연두 강조 + 1.08배. */
  dropTarget?: boolean;
  onDragStart?: (screenX: number, screenY: number) => void;
  onDragMove?: (screenX: number, screenY: number) => void;
  onDragEnd?: () => void;
  onDrop?: (toolId: DockToolId, clientX: number, clientY: number) => void;
  onClick: () => void;
}) {
  const draggedRef = useRef(false);
  const id = item.toolId;
  // 목표 크기: 커서·중심 MotionValue에서 파생. 실제 크기: 스프링. 둘 다 React 렌더 밖에서 돈다.
  const target = useTransform(() => {
    const c = centers.get()[id];
    return c === undefined ? layout.dock.iconBase : magnifiedSize(mouseX.get() - c);
  });
  const spring = useSpring(target, MAGNIFY_SPRING);
  // 동작 줄이기면 스프링을 건너뛴다(확대 자체도 Dock이 꺼 두므로 늘 40px).
  const size = reducedMotion ? target : spring;
  useEffect(() => {
    registerSize(id, size);
    return () => registerSize(id, null);
  }, [id, size, registerSize]);

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
    <motion.button
      type="button"
      data-dock-id={item.toolId}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={label}
      aria-pressed={pressed}
      className={[
        "group relative flex flex-col items-center justify-center outline-none",
        // FEAT-trash-drag: 드롭 대상 강조 — 연두 배경(브레드크럼 드롭 강조와 같은 색).
        dropTarget ? "rounded-full bg-accent-lime/30" : "",
      ].join(" ")}
      style={{
        // 2단계 리뷰 P1-1: 슬롯을 hover 크기(72px)로 고정하지 않는다 — 평상시
        // iconBase(40px)이고 hover 확대만큼만 늘어나야(맥 독처럼) 독 실제 폭이
        // layout.dock.width 근사치에 맞고 가운데 정렬이 어긋나지 않는다.
        // 호버 성능: width/height는 MotionValue — mousemove마다 React 렌더·CSS transition 없이
        // motion이 rAF 한 번에 DOM style을 쓴다.
        width: size,
        height: size,
        // FEAT-trash-drag: dropTarget이면 hover 확대 크기에 1.08을 곱해 키운다(AC-5).
        // transform은 레이아웃 폭에 영향이 없어 독 가운데 정렬을 흔들지 않는다.
        transform: dropTarget ? "scale(1.08)" : undefined,
        transition: "transform 120ms ease-out",
      }}
    >
      <motion.span
        className="relative flex items-center justify-center"
        style={{
          width: size,
          height: size,
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
      </motion.span>
      {badge && (
        <span
          aria-hidden="true"
          data-dock-badge="true"
          className="absolute right-0 top-0 h-2 w-2 rounded-full"
          style={{ background: "var(--color-accent-blue)" }}
        />
      )}
      {showLabel && (
        <span className="absolute -bottom-1 whitespace-nowrap text-[11px] leading-none text-text-muted">
          {label}
        </span>
      )}
    </motion.button>
  );
}
