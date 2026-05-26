"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace, type Card } from "@/state/workspace";
import { CardContent } from "./cards/CardContent";
import { DrawingLayer } from "./cards/_shared/DrawingLayer";
import { ResizeHandles } from "./ResizeHandles";
import { AIOptOutBadge } from "@/components/privacy/AIOptOutBadge";
import { ExpandIcon, LockIcon } from "@/components/icons";
import { useT } from "@/i18n/Provider";

const DRAG_THRESHOLD = 3; // px — 이 거리 넘으면 드래그로 인식

export function DraggableCard({ card }: { card: Card }) {
  const t = useT();
  const moveCard = useWorkspace((s) => s.moveCard);
  const moveSelectedBy = useWorkspace((s) => s.moveSelectedBy);
  const setContent = useWorkspace((s) => s.setContent);
  const selectOne = useWorkspace((s) => s.selectOne);
  const toggleSelect = useWorkspace((s) => s.toggleSelect);
  const setEditing = useWorkspace((s) => s.setEditing);
  const setExpandedCard = useWorkspace((s) => s.setExpandedCard);
  const toggleAIOptOut = useWorkspace((s) => s.toggleAIOptOut);
  // FEAT-markdown-memo-pen: 펜 모드 — 메모 카드 위 DrawingLayer overlay.
  const penMode = useWorkspace((s) => s.penMode);
  const penTool = useWorkspace((s) => s.penTool);
  const penWidth = useWorkspace((s) => s.penWidth);
  const setOverlay = useWorkspace((s) => s.setOverlay);
  /**
   * 카드별 atomic selector — 자기 ID에 대한 boolean만 구독.
   * selectedIds 배열 전체를 구독하면 다른 카드 선택/해제 때마다 모든 카드가 리렌더.
   * 100+ 카드에서 lag spike의 근본 원인.
   */
  const selected = useWorkspace((s) => s.selectedIds.includes(card.id));
  const editing = useWorkspace((s) => s.editingId === card.id);
  /**
   * 리사이즈 핸들 노출 조건 — 자기 카드가 유일하게 선택된 경우.
   * `selectedIds.length`만 구독하면 다른 카드 선택/해제 때마다 200+ 카드가 리렌더되어
   * atomic selector 최적화(line 27)가 무력화된다. boolean 결과로 좁혀 자기 변화만 본다.
   */
  const isOnlySelected = useWorkspace(
    (s) => s.selectedIds.length === 1 && s.selectedIds[0] === card.id,
  );
  const getScale = () => useWorkspace.getState().viewport.scale;

  /**
   * card.height가 없을 때 ResizeHandles에 넘길 실측 높이.
   * useLayoutEffect로 paint 전에 동기 측정해 mount 직후 핸들 클릭 race를 방지.
   * 측정 실패(0) 대비 default 100을 두지만, 정상 흐름에선 첫 paint 전 실제 값으로 덮인다.
   */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(100);
  useLayoutEffect(() => {
    if (card.height !== undefined) return; // 명시 높이 있으면 측정 불필요
    const el = containerRef.current;
    if (!el) return;
    setMeasuredHeight(el.offsetHeight);
  }, [card.height, card.content, card.kind]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    lastWX: number;
    lastWY: number;
    moved: boolean;
    multi: boolean;
  } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    if (penMode) return; // 펜 모드: 드래그 대신 그리기 (DrawingLayer가 포인터 처리)
    if (editing) return; // 편집 중에는 드래그 안 함 (텍스트 선택 가능하게)
    if (e.button !== 0) return; // 좌클릭만
    e.stopPropagation();

    const modifier = e.shiftKey || e.metaKey || e.ctrlKey;
    if (modifier) {
      // 다중선택 토글만 수행, 드래그 시작하지 않음
      toggleSelect(card.id);
      return;
    }

    // 다중선택 중이고 자기가 포함되어 있으면 묶음 드래그 시작 (Figma 스타일).
    // mouseup 시 이동 없었으면 단일 선택으로 환원.
    const ids = useWorkspace.getState().selectedIds;
    const wasInMulti = ids.length > 1 && ids.includes(card.id);
    if (!wasInMulti) {
      selectOne(card.id);
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: card.x,
      originY: card.y,
      lastWX: card.x,
      lastWY: card.y,
      moved: false,
      multi: wasInMulti,
    };

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        d.moved = true;
      }
      if (!d.moved) return;
      const s = getScale();
      if (d.multi) {
        const targetX = d.originX + dx / s;
        const targetY = d.originY + dy / s;
        moveSelectedBy(targetX - d.lastWX, targetY - d.lastWY);
        d.lastWX = targetX;
        d.lastWY = targetY;
      } else {
        moveCard(card.id, d.originX + dx / s, d.originY + dy / s);
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      // 다중선택 중 클릭만 했다면 단일 선택으로 환원 (Figma 스타일).
      if (d && !d.moved && d.multi) {
        selectOne(card.id);
      }
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (penMode) return; // 펜 모드에선 편집 진입 안 함
    if (card.kind === "comment") return;
    setEditing(card.id);
  };

  // FEAT-markdown-memo-pen D7: v1은 메모(text) 카드에만 그리기 overlay.
  // 그림이 있으면 펜 모드가 아니어도 표시(active=false → 클릭 통과).
  const showOverlay = card.kind === "text" && (penMode || !!card.overlay);

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      data-card-id={card.id}
      className={[
        "group absolute select-none",
        penMode
          ? "" // 펜 모드: 커서는 Canvas 전역 펜. DrawingLayer가 그리기 커서 담당.
          : editing
            ? "cursor-text"
            : "cursor-grab active:cursor-grabbing",
      ].join(" ")}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        zIndex: selected ? 20 : 10,
        outline: selected ? "2px solid rgba(79, 124, 243, 0.45)" : "none",
        outlineOffset: 2,
        borderRadius: 8,
        // height 지정 시 자식 콘텐츠가 카드를 가득 채우도록 flex column.
        // 각 CardContent 루트 div는 h-full을 가져 부모 높이를 상속받는다.
        display: card.height !== undefined ? "flex" : undefined,
        flexDirection: card.height !== undefined ? "column" : undefined,
        overflow: card.height !== undefined ? "hidden" : undefined,
      }}
    >
      <CardContent
        card={card}
        editing={editing}
        onChange={(content) => setContent(card.id, content)}
        onCommitEdit={() => setEditing(null)}
      />

      {/* FEAT-markdown-memo-pen: 메모 위 그리기 overlay. 카드에 종속 → 함께 이동·저장. */}
      {showOverlay && (
        <div className="absolute inset-0" style={{ zIndex: 25 }}>
          <DrawingLayer
            value={card.overlay ?? ""}
            active={penMode}
            penWidth={penWidth}
            tool={penTool}
            onChange={(json) => setOverlay(card.id, json)}
          />
        </div>
      )}

      {/*
       * FEAT-memo-expand: 메모(text) 카드 펼치기 버튼 — 호버 시 우상단에 노출.
       * 클릭하면 모달로 크게 열린다. 펜 모드에선 숨김(그리기 방해 방지).
       * opacity로 호버 토글하되 키보드 포커스(focus-visible) 시에도 노출해 a11y 보장.
       */}
      {card.kind === "text" && !penMode && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setExpandedCard(card.id);
          }}
          aria-label={t("workspace.memoEditor.expand")}
          data-card-expand
          className="absolute right-1 top-1 z-[31] flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-bg text-text-soft opacity-0 shadow-card transition-opacity hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ExpandIcon size={13} />
        </button>
      )}

      {/* FEAT-privacy: aiOptOut 표시 (우상단). 선택 시에는 토글 버튼으로 전환. */}
      {card.aiOptOut && !selected && (
        <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-bg p-0.5 shadow-card">
          <AIOptOutBadge size={12} />
        </span>
      )}
      {selected && !editing && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleAIOptOut(card.id);
          }}
          aria-label={
            card.aiOptOut
              ? t("privacy.card.toggleDisable")
              : t("privacy.card.toggleEnable")
          }
          aria-pressed={!!card.aiOptOut}
          className={[
            "absolute -right-2 -top-2 z-[32] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-bg shadow-card transition-colors",
            card.aiOptOut
              ? "text-text"
              : "text-text-soft hover:text-text",
          ].join(" ")}
        >
          <LockIcon size={12} />
        </button>
      )}
      {isOnlySelected && !editing && card.kind !== "comment" && (
        <ResizeHandles card={card} measuredHeight={measuredHeight} />
      )}
    </div>
  );
}
