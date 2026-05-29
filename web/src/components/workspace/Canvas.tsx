"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";
import { DraggableCard } from "./DraggableCard";
import { SystemBoard } from "./SystemBoard";
import { SystemBoardEmpty } from "./cards/SystemBoardEmpty";
import { ZoomBar } from "./ZoomBar";
import { useVirtualizedCards } from "./useVirtualizedCards";

/** FEAT-home AC-2: 시스템 보드에서 빈 안내로 전환되는 메모 임계치. */
const SYSTEM_EMPTY_THRESHOLD = 10;

/** FEAT-canvas AC-3: 가상화·성능 안내 토스트 임계치 (PRD §26-1, REQ-16). */
const VIRTUALIZATION_TOAST_THRESHOLD = 200;

const WHEEL_ZOOM_INTENSITY = 0.0015;
const MARQUEE_THRESHOLD = 4; // px — 박스로 인식할 최소 드래그 거리

/** FEAT-markdown-memo-pen: 펜 모드 커서 — 펜 모양 SVG. hotspot은 펜촉(좌하단). */
const PEN_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l3.5-1L17 9.5 14.5 7 4 17.5 3 21z' fill='%23333' stroke='white' stroke-width='1'/%3E%3Cpath d='M15 6.5l2.5 2.5 2-2a1.4 1.4 0 0 0 0-2l-.5-.5a1.4 1.4 0 0 0-2 0l-2 2z' fill='%234f7cf3' stroke='white' stroke-width='1'/%3E%3C/svg%3E\") 2 22, crosshair";

interface Marquee {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  additive: boolean;
  active: boolean;
}

function rectsIntersect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [canvasRect, setCanvasRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({ left: 0, top: 0, width: 0, height: 0 });

  const cards = useWorkspace((s) => s.cards);
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const boardTransitioning = useWorkspace((s) => s.boardTransitioning);
  const viewport = useWorkspace((s) => s.viewport);
  const selectedIds = useWorkspace((s) => s.selectedIds);
  const editingId = useWorkspace((s) => s.editingId);
  const sidebarDrag = useWorkspace((s) => s.sidebarDrag);
  const selectMany = useWorkspace((s) => s.selectMany);
  const clearSelection = useWorkspace((s) => s.clearSelection);
  const removeSelected = useWorkspace((s) => s.removeSelected);
  const panBy = useWorkspace((s) => s.panBy);
  const zoomAt = useWorkspace((s) => s.zoomAt);
  // FEAT-markdown-memo-pen: 펜 모드 — 전역 커서 변경 + E/[/]/Esc 키.
  const penMode = useWorkspace((s) => s.penMode);
  const setPenMode = useWorkspace((s) => s.setPenMode);
  const setPenTool = useWorkspace((s) => s.setPenTool);
  const setPenWidth = useWorkspace((s) => s.setPenWidth);
  // FEAT-subcanvas: 선택이 없을 때 Esc → 부모 캔버스로 한 단계 위.
  const goToParent = useWorkspace((s) => s.goToParent);
  const pushToast = useToasts((s) => s.push);
  const t = useT();

  /**
   * 사이드바 도구 커스텀 드래그 중 — 커서가 캔버스 위에 있으면 drop hint 점 표시.
   * 좌표는 캔버스 로컬(rect.left/top 기준). 캔버스 밖이거나 드래그 종료면 null.
   */
  const dropHint = (() => {
    if (!sidebarDrag) return null;
    const x = sidebarDrag.screenX - canvasRect.left;
    const y = sidebarDrag.screenY - canvasRect.top;
    if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) return null;
    return { x, y };
  })();

  /* ─ FEAT-canvas AC-3: viewport 가상화 — viewport 밖 카드는 DOM에서 제외 ─ */
  const visibleCards = useVirtualizedCards({
    cards,
    viewport,
    canvasSize: { width: canvasRect.width, height: canvasRect.height },
    editingId,
  });

  /* ─ 캔버스 실측 위치·크기 추적 (ResizeObserver + window resize) ─ */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  /* ─ FEAT-canvas AC-3: 200 임계 도달 시 1회 안내 토스트 ─ */
  const toastFiredRef = useRef(false);
  useEffect(() => {
    if (toastFiredRef.current) return;
    if (cards.length < VIRTUALIZATION_TOAST_THRESHOLD) return;
    toastFiredRef.current = true;
    pushToast({
      tone: "calm",
      title: t("workspace.canvas.virtualization.toastTitle"),
      body: t("workspace.canvas.virtualization.toastBody"),
      duration: 6000,
    });
  }, [cards.length, pushToast, t]);

  /* ─ Space + Delete/Backspace 키 처리 ─ */
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el?.matches("input, textarea, [contenteditable='true']");
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping()) {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      // FEAT-markdown-memo-pen: 펜 모드 키 — 다른 캔버스 키보다 우선.
      if (penMode) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPenMode(false);
        } else if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          const cur = useWorkspace.getState().penTool;
          setPenTool(cur === "pen" ? "eraser" : "pen");
        } else if (e.key === "[") {
          e.preventDefault();
          setPenWidth(useWorkspace.getState().penWidth - 1);
        } else if (e.key === "]") {
          e.preventDefault();
          setPenWidth(useWorkspace.getState().penWidth + 1);
        }
        return; // 펜 모드 중 삭제 등 다른 키 차단
      }
      if (editingId) return;
      if (isTyping()) return;
      if (selectedIds.length === 0) {
        // FEAT-subcanvas: 선택이 없으면 Esc로 부모 캔버스로 올라간다(루트면 no-op).
        // 단, 모달(펼치기·템플릿·삭제 다이얼로그)이 열려 있으면 그쪽 Esc에 양보한다.
        if (e.key === "Escape") {
          const ws = useWorkspace.getState();
          const modalOpen =
            ws.expandedCardId !== null ||
            ws.templatePickerOpen ||
            ws.deleteDialogBoardId !== null;
          if (!modalOpen) void goToParent();
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        clearSelection();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [
    selectedIds,
    editingId,
    removeSelected,
    clearSelection,
    penMode,
    setPenMode,
    setPenTool,
    setPenWidth,
    goToParent,
  ]);

  /* ─ 휠 줌 (캔버스 위에서 wheel은 항상 줌으로 처리) ─ */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // pinch 트랙패드는 ctrlKey=true로 들어옴. 일반 휠도 줌으로.
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_INTENSITY);
      zoomAt(factor, sx, sy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ─ Space+drag / 미들 마우스 팬 — capture phase로 등록해 카드 위에서도 가로챔 ─ */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onMouseDownCapture = (e: MouseEvent) => {
      const isMiddle = e.button === 1;
      const isSpacePan = spaceDown && e.button === 0;
      if (!isMiddle && !isSpacePan) return;

      e.preventDefault();
      e.stopPropagation();
      setPanning(true);
      let lastX = e.clientX;
      let lastY = e.clientY;

      const onMove = (ev: MouseEvent) => {
        panBy(ev.clientX - lastX, ev.clientY - lastY);
        lastX = ev.clientX;
        lastY = ev.clientY;
      };
      const onUp = () => {
        setPanning(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    el.addEventListener("mousedown", onMouseDownCapture, true);
    return () =>
      el.removeEventListener("mousedown", onMouseDownCapture, true);
  }, [spaceDown, panBy]);

  /* ─ 빈 캔버스 좌클릭 → rubber-band 박스 시작 (modifier 없으면 선택 치환, 있으면 합집합) ─ */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (spaceDown) return;
    if (e.target !== e.currentTarget) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    setMarquee({
      startX: sx,
      startY: sy,
      endX: sx,
      endY: sy,
      additive,
      active: false,
    });

    const onMove = (ev: MouseEvent) => {
      const ex = ev.clientX - rect.left;
      const ey = ev.clientY - rect.top;
      const dist = Math.hypot(ex - sx, ey - sy);
      setMarquee((m) =>
        m
          ? {
              ...m,
              endX: ex,
              endY: ey,
              active: m.active || dist > MARQUEE_THRESHOLD,
            }
          : m,
      );
    };

    const onUp = (ev: MouseEvent) => {
      const ex = ev.clientX - rect.left;
      const ey = ev.clientY - rect.top;
      const dist = Math.hypot(ex - sx, ey - sy);

      if (dist <= MARQUEE_THRESHOLD) {
        // 단순 클릭 → modifier 없으면 선택 해제
        if (!additive) clearSelection();
        setMarquee(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        return;
      }

      // 박스와 교차한 카드 ids 계산 — DOM 실제 bbox 기준
      const canvasEl = canvasRef.current;
      const boxL = Math.min(sx, ex);
      const boxT = Math.min(sy, ey);
      const boxW = Math.abs(ex - sx);
      const boxH = Math.abs(ey - sy);
      const hits: string[] = [];
      if (canvasEl) {
        const cardEls = canvasEl.querySelectorAll<HTMLElement>(
          "[data-card-id]",
        );
        cardEls.forEach((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left - rect.left;
          const cy = r.top - rect.top;
          if (rectsIntersect(boxL, boxT, boxW, boxH, cx, cy, r.width, r.height)) {
            const id = el.dataset.cardId;
            if (id) hits.push(id);
          }
        });
      }
      selectMany(hits, additive);

      setMarquee(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const cursorClass = panning
    ? "cursor-grabbing"
    : spaceDown
      ? "cursor-grab"
      : "cursor-default";

  return (
    <div
      ref={canvasRef}
      data-canvas-root="true"
      onMouseDown={onMouseDown}
      className={`relative h-full overflow-hidden bg-bg ${cursorClass}`}
      // FEAT-markdown-memo-pen: 펜 모드면 전역 커서를 펜으로(inline이 class를 덮음).
      style={penMode ? { cursor: PEN_CURSOR } : undefined}
    >
      {/* world layer — viewport transform 적용. 사용자 카드는 항상 렌더한다.
          FEAT-boards AC-4: 보드 전환 시 200ms ease-out fade. */}
      <div
        data-board-transitioning={boardTransitioning ? "true" : "false"}
        className="absolute left-0 top-0 origin-top-left transition-opacity duration-200 ease-out"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
          willChange: "transform, opacity",
          opacity: boardTransitioning ? 0 : 1,
        }}
      >
        {visibleCards.map((card) => (
          <DraggableCard key={card.id} card={card} />
        ))}
      </div>

      {/* 빈 안내 — 시스템 보드 + 카드가 한 장도 없을 때만. 작업물이 있으면 안내가 가리지 않는다. */}
      {currentBoardId === SYSTEM_BOARD_ID && cards.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
          style={{ opacity: boardTransitioning ? 0 : 1 }}
        >
          <SystemBoardEmpty />
        </div>
      )}

      {/* FEAT-home AC-1: 시스템 보드 + 메모 ≥ 10 → 큐레이팅 카드 (휴리스틱 MVP).
          가상 카드 — viewport 변환을 받지 않는 screen-fixed 레이어로 렌더해
          selection/drag/zoom 시스템과 완전히 격리된다 (AC-5 자동 충족).
          현재 휴리스틱 UX 미숙으로 임시 비활성화 — 다듬은 뒤 복원. */}
      {false &&
        currentBoardId === SYSTEM_BOARD_ID &&
        cards.length >= SYSTEM_EMPTY_THRESHOLD && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
            style={{ opacity: boardTransitioning ? 0 : 1 }}
          >
            <SystemBoard />
          </div>
        )}

      {/* 우상단 정리 안 됨 배지 (viewport 영향 받지 않음) */}
      <div className="pointer-events-none absolute right-7 top-5 z-[var(--z-panel)]">
        <div
          className="rounded-md px-2.5 py-1.5 text-[12px]"
          style={{
            background: "var(--gradient-paper)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <span className="font-semibold text-text">{cards.length}</span>
          <span className="ml-1 text-text-muted">Unsorted</span>
        </div>
      </div>

      {/* rubber-band 다중선택 박스 (screen 좌표, viewport 변환 받지 않음) */}
      {marquee && marquee.active && (
        <div
          className="pointer-events-none absolute z-[var(--z-selection)]"
          style={{
            left: Math.min(marquee.startX, marquee.endX),
            top: Math.min(marquee.startY, marquee.endY),
            width: Math.abs(marquee.endX - marquee.startX),
            height: Math.abs(marquee.endY - marquee.startY),
            background: "rgba(79, 124, 243, 0.08)",
            border: "1px solid rgba(79, 124, 243, 0.5)",
            borderRadius: 2,
          }}
        />
      )}

      {/* drop hint */}
      {dropHint && (
        <div
          className="pointer-events-none absolute z-[var(--z-selection)]"
          style={{
            left: dropHint.x - 12,
            top: dropHint.y - 12,
            width: 24,
            height: 24,
            borderRadius: 12,
            border: "2px dashed rgba(79,124,243,0.5)",
          }}
        />
      )}

      <ZoomBar />
    </div>
  );
}
