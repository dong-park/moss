"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useWorkspace, type Card } from "@/state/workspace";
import { CardContent } from "./cards/CardContent";
import { isExpandable } from "./cards/_shared/expandable";
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
  // FEAT-subcanvas: 함 카드 더블클릭 진입 + 드래그로 카드 넣기.
  const enterSubcanvas = useWorkspace((s) => s.enterSubcanvas);
  const moveCardToSubcanvas = useWorkspace((s) => s.moveCardToSubcanvas);
  const setDropTargetFunnel = useWorkspace((s) => s.setDropTargetFunnel);
  // 드래그 grab/drop 손맛: 들어올린 카드에 lift 시각효과(scale/shadow/z).
  const setDragging = useWorkspace((s) => s.setDragging);
  // FEAT-markdown-memo-pen: 펜 모드 — 드래그/편집 진입 차단 분기에 쓰인다.
  // 펜 overlay 자체는 TextCardContent(컬럼 안)가 렌더한다.
  const penMode = useWorkspace((s) => s.penMode);
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
  /**
   * 들어올림(lift) 여부 — 자기가 잡힌 카드이거나, 묶음 드래그 중이고 선택에 포함된 경우.
   * 단일 boolean으로 좁혀 lift 값이 실제로 바뀌는 카드만 리렌더(line 43 최적화와 동일 철학).
   * 비선택 카드는 묶음 드래그가 시작돼도 값이 false 그대로라 리렌더되지 않는다.
   */
  const lifted = useWorkspace(
    (s) =>
      s.draggingId === card.id ||
      (s.draggingMulti && s.selectedIds.includes(card.id)),
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

    // FEAT-subcanvas: 단일 카드 드래그 중 커서 아래의 함 카드(자기 제외)를 추적.
    // elementsFromPoint는 위→아래 순서라, 끌고 있는 카드를 건너뛰고 그 아래 카드를 본다.
    let hoveredFunnelId: string | null = null;
    const findFunnelUnder = (clientX: number, clientY: number): string | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const host = (el as HTMLElement).closest?.(
          "[data-card-id]",
        ) as HTMLElement | null;
        if (!host) continue;
        const id = host.dataset.cardId;
        if (!id || id === card.id) continue;
        const target = useWorkspace.getState().cards.find((c) => c.id === id);
        return target?.kind === "board" ? id : null;
      }
      return null;
    };

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        d.moved = true;
        // 임계를 넘는 순간 카드가 떠오른다(lift). 묶음이면 선택 전체.
        setDragging(card.id, d.multi);
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
        const funnel = findFunnelUnder(ev.clientX, ev.clientY);
        if (funnel !== hoveredFunnelId) {
          hoveredFunnelId = funnel;
          setDropTargetFunnel(funnel);
        }
      }
    };

    /**
     * 함 위에서 놓았을 때 — 카드를 함 중심으로 빨아들이는 흡수 모션 후 이동.
     * WAAPI(element.animate) 미지원 환경(jsdom 등)이면 애니메이션 없이 즉시 이동.
     * lift 상태는 흡수 애니메이션이 그대로 이어받고, 카드는 이동으로 언마운트되므로
     * 여기서 setDragging(null)을 미리 부르지 않는다(이동 완료 후 정리).
     */
    const runAbsorb = (funnelId: string) => {
      const cardEl = containerRef.current;
      const funnelEl = document.querySelector<HTMLElement>(
        `[data-card-id="${funnelId}"]`,
      );
      // WAAPI 미지원(jsdom 등)·요소 없음 → 애니메이션 없이 즉시 이동.
      if (!cardEl || typeof cardEl.animate !== "function" || !funnelEl) {
        void moveCardToSubcanvas(card.id, funnelId).then(() => setDragging(null));
        return;
      }
      const cr = cardEl.getBoundingClientRect();
      const fr = funnelEl.getBoundingClientRect();
      const s = getScale();
      // 화면 좌표 중심차 → 카드 로컬 transform(부모 world layer scale 보정).
      const dx = (fr.left + fr.width / 2 - (cr.left + cr.width / 2)) / s;
      const dy = (fr.top + fr.height / 2 - (cr.top + cr.height / 2)) / s;
      // 함이 콕 받아내는 bump.
      funnelEl.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }],
        { duration: 260, easing: "ease-out" },
      );
      const anim = cardEl.animate(
        [
          { transform: "scale(1.03) rotate(-1.5deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0 },
        ],
        { duration: 240, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" },
      );
      anim.onfinish = () => {
        void moveCardToSubcanvas(card.id, funnelId).then(() => {
          // 이동이 거부되면(사이클 가드 등) 카드가 state에 남는다 — fill:forwards로
          // 투명 고정된 흡수를 취소해 되돌려야 "사라진 것처럼" 보이지 않는다.
          if (useWorkspace.getState().cards.some((c) => c.id === card.id)) {
            anim.cancel();
          }
          setDragging(null);
        });
      };
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      // 다중선택 중 클릭만 했다면 단일 선택으로 환원 (Figma 스타일). lift 없었음.
      if (d && !d.moved && d.multi) {
        selectOne(card.id);
        return;
      }
      // 드래그하지 않은 단순 클릭 — 정리할 lift 없음.
      if (!d || !d.moved) {
        setDropTargetFunnel(null);
        return;
      }
      // FEAT-subcanvas: 함 위에서 놓았으면 흡수 모션 후 그 서브 캔버스로 이동.
      if (!d.multi && hoveredFunnelId) {
        runAbsorb(hoveredFunnelId);
        hoveredFunnelId = null;
        return;
      }
      // 일반 드롭 — lift 해제(스프링 안착).
      setDragging(null);
      setDropTargetFunnel(null);
      hoveredFunnelId = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (penMode) return; // 펜 모드에선 편집 진입 안 함
    // FEAT-subcanvas: 함 카드 더블클릭 → 서브 캔버스 진입.
    if (card.kind === "board") {
      void enterSubcanvas(card.id);
      return;
    }
    // FEAT-memo-expand: 확대 지원 카드(text 등)는 더블클릭으로 펼치기 모달을 연다.
    // 인라인 편집(setEditing)을 완전 대체 — 편집은 모달 안에서 한다.
    if (isExpandable(card)) {
      setExpandedCard(card.id);
      return;
    }
    if (card.kind === "comment") return;
    setEditing(card.id);
  };

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
        zIndex: lifted ? 40 : selected ? 20 : 10,
        outline: selected ? "2px solid rgba(79, 124, 243, 0.45)" : "none",
        outlineOffset: 2,
        borderRadius: 8,
        // 들어올림(grab): 살짝 떠오르며 그림자 깊어짐. 손 떼면(lifted=false)
        // transform이 스프링 곡선으로 1.0 복귀 → 제자리 안착(settle).
        // left/top은 transition 목록에서 제외해 드래그 중 커서를 즉시 추종한다.
        transform: lifted ? "scale(1.03) rotate(-1.5deg)" : undefined,
        boxShadow: lifted ? "var(--shadow-card-lift)" : undefined,
        transition:
          "transform 170ms cubic-bezier(0.22, 0.9, 0.3, 1.25), box-shadow 170ms ease-out",
        willChange: lifted ? "transform" : undefined,
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

      {/*
       * FEAT-memo-expand: 메모(text) 카드 펼치기 버튼 — 호버 시 우상단에 노출.
       * 클릭하면 모달로 크게 열린다. 펜 모드에선 숨김(그리기 방해 방지).
       * opacity로 호버 토글하되 키보드 포커스(focus-visible) 시에도 노출해 a11y 보장.
       */}
      {isExpandable(card) && !penMode && (
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
