"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  useWorkspace,
  computeBreadcrumb,
  SYSTEM_BOARD_ID,
  type Card,
} from "@/state/workspace";
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
  // FEAT-sticky-redesign: 메모판 이동(멤버 동반) + 드롭 종료 시 소속 재판정.
  const moveFrame = useWorkspace((s) => s.moveFrame);
  const resolveMembership = useWorkspace((s) => s.resolveMembership);
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
  // FEAT-eject: 함 밖(상위/조상 보드)으로 카드를 꺼내는 역방향 — 브레드크럼 드롭 + 우클릭.
  const moveCardToBoard = useWorkspace((s) => s.moveCardToBoard);
  const setDropTargetCrumb = useWorkspace((s) => s.setDropTargetCrumb);
  const boards = useWorkspace((s) => s.boards);
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
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
   * FEAT-pen-mode-ux B2 (AC-2): 그릴 수 있는 곳 affordance.
   * 펜 overlay(DrawingLayer)는 text 카드만 렌더하므로 text=그릴 수 있는 메모, 그 외=불가.
   * 메모 카드는 호버 시 하이라이트로 "여기 그릴 수 있음"을 알리고, 비메모 카드 위에선
   * 커서를 not-allowed로 바꿔 잘못된 그리기 시도를 막는다.
   */
  const penDrawable = penMode && card.kind === "text";
  const penBlocked = penMode && card.kind !== "text";

  /**
   * FEAT-eject: 서브캔버스(함) 안일 때만 노출할 "상위로 내보내기" 조상 목록.
   * computeBreadcrumb는 루트→현재 순 — 현재 보드를 뺀 조상들이 내보낼 수 있는 후보.
   * 비어 있으면(루트/시스템 보드) 우클릭 메뉴 자체를 렌더하지 않는다.
   */
  const ancestors = useMemo(
    () => computeBreadcrumb(boards, currentBoardId).slice(0, -1),
    [boards, currentBoardId],
  );

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

    // FEAT-eject: 흡수(findFunnelUnder)의 대칭 — 커서 아래 브레드크럼 조상 조각을 탐지.
    // crumb는 world layer 밖 fixed지만 elementsFromPoint는 화면좌표라 그대로 잡힌다.
    let hoveredCrumbId: string | null = null;
    const findCrumbUnder = (clientX: number, clientY: number): string | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const host = (el as HTMLElement).closest?.(
          "[data-crumb-board-id]",
        ) as HTMLElement | null;
        if (host) return host.dataset.crumbBoardId ?? null;
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
      } else if (card.kind === "frame") {
        // FEAT-sticky-redesign: 판 단독 드래그 — 속한 메모도 같은 델타로 따라온다.
        // 펀넬/크럼 흡수-이젝트 대상이 아니므로 그 탐지는 건너뛴다.
        const targetX = d.originX + dx / s;
        const targetY = d.originY + dy / s;
        moveFrame(card.id, targetX - d.lastWX, targetY - d.lastWY);
        d.lastWX = targetX;
        d.lastWY = targetY;
      } else {
        moveCard(card.id, d.originX + dx / s, d.originY + dy / s);
        // crumb(밖으로)와 funnel(안으로)을 동시에 추적하되, 둘 다 hover면 crumb 우선
        // — 조각 위에서는 함 하이라이트를 끈다.
        const crumb = findCrumbUnder(ev.clientX, ev.clientY);
        if (crumb !== hoveredCrumbId) {
          hoveredCrumbId = crumb;
          setDropTargetCrumb(crumb);
        }
        const funnel = crumb ? null : findFunnelUnder(ev.clientX, ev.clientY);
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

    /**
     * FEAT-eject: 브레드크럼 조각 위에서 놓았을 때 — runAbsorb의 정확한 역모션.
     * 카드를 조각 중심으로 날려보내며 fade + 조각 bump → moveCardToBoard로 상위 보드 이동.
     * WAAPI(element.animate) 미지원 환경(jsdom 등)·요소 없음이면 애니메이션 없이 즉시 이동.
     */
    const runEject = (crumbBoardId: string) => {
      const cardEl = containerRef.current;
      const crumbEl = document.querySelector<HTMLElement>(
        `[data-crumb-board-id="${crumbBoardId}"]`,
      );
      if (!cardEl || typeof cardEl.animate !== "function" || !crumbEl) {
        void moveCardToBoard(card.id, crumbBoardId).then(() => {
          setDragging(null);
          setDropTargetCrumb(null);
        });
        return;
      }
      const cr = cardEl.getBoundingClientRect();
      const br = crumbEl.getBoundingClientRect();
      const s = getScale();
      // 화면 좌표 중심차 → 카드 로컬 transform(부모 world layer scale 보정).
      const dx = (br.left + br.width / 2 - (cr.left + cr.width / 2)) / s;
      const dy = (br.top + br.height / 2 - (cr.top + cr.height / 2)) / s;
      // 조각이 콕 받아내는 bump.
      crumbEl.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
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
        void moveCardToBoard(card.id, crumbBoardId).then(() => {
          // 이동이 거부되면 카드가 남는다 — fill:forwards 투명 고정을 취소해 되돌린다.
          if (useWorkspace.getState().cards.some((c) => c.id === card.id)) {
            anim.cancel();
          }
          setDragging(null);
          setDropTargetCrumb(null);
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
        setDropTargetCrumb(null);
        return;
      }
      // FEAT-eject: 브레드크럼 조각 위에서 놓았으면 역모션 후 상위 보드로 내보낸다(crumb 우선).
      if (!d.multi && hoveredCrumbId) {
        runEject(hoveredCrumbId);
        hoveredCrumbId = null;
        hoveredFunnelId = null;
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
      setDropTargetCrumb(null);
      hoveredFunnelId = null;
      hoveredCrumbId = null;

      // FEAT-sticky-redesign §4: 드롭 종료 시점에만 소속을 다시 정한다.
      if (d.multi) {
        const selectedIds = useWorkspace.getState().selectedIds;
        // 2단계 리뷰 P1: 선택에 판이 섞여 있으면 그 판이 옮겨진 것 — 선택 안 된
        // 카드도 새로 들어오거나 빠질 수 있으므로 보드 전체(비-frame)를 재판정한다.
        // 판이 없는 순수 다중 선택이면 기존대로 선택분만 재판정.
        const hasFrame = useWorkspace
          .getState()
          .cards.some((c) => selectedIds.includes(c.id) && c.kind === "frame");
        if (hasFrame) {
          const ids = useWorkspace
            .getState()
            .cards.filter((c) => c.kind !== "frame")
            .map((c) => c.id);
          resolveMembership(ids);
        } else {
          resolveMembership(selectedIds);
        }
      } else if (card.kind === "frame") {
        // 판이 옮겨지면 새로 안에 들어온 메모도 속하게 된다 — 전체를 재판정.
        const ids = useWorkspace
          .getState()
          .cards.filter((c) => c.kind !== "frame")
          .map((c) => c.id);
        resolveMembership(ids);
      } else {
        resolveMembership([card.id]);
      }
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
    // FEAT-sticky-redesign: 판은 이름표 자체 더블클릭(FrameCardContent)이 이름 편집을
    // 담당한다 — 카드 본문 편집 모드(editingId)로 들어가지 않는다.
    if (card.kind === "frame") return;
    setEditing(card.id);
  };

  const cardNode = (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      data-card-id={card.id}
      className={[
        "group absolute select-none",
        penMode
          ? // 펜 모드: 메모는 전역 펜 커서 유지(그릴 수 있음), 비메모는 not-allowed(B2).
            penBlocked
            ? "cursor-not-allowed"
            : ""
          : editing
            ? "cursor-text"
            : "cursor-grab active:cursor-grabbing",
      ].join(" ")}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        // FEAT-sticky-redesign 2단계 리뷰 P1: 메모판은 선택돼도 항상 메모보다
        // 아래층이어야 한다(이전엔 selected일 때 20이 돼 위층 메모를 가렸다).
        // 선택 표시는 outline(아래)으로만 하고, z는 미선택(1)/선택(2) 두 단계로만
        // 살짝 올려 겹친 판끼리의 선택 강조만 챙긴다 — 메모(10/40)는 항상 그 위.
        zIndex: lifted
          ? 40
          : card.kind === "frame"
            ? selected
              ? 2
              : 1
            : selected
              ? 20
              : 10,
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
        // n10 브라우저 결함3: 이전엔 card.height가 있을 때만 overflow:hidden이었다
        // — height가 없는(auto-grow) 카드는 크롭이 아예 꺼져, 고정폭 720px 블록
        // 막대(MEMO_CONTENT_WIDTH)가 카드의 실제 폭(width는 항상 지정돼 있다)
        // 오른쪽 끝을 넘어 그대로 보였다. width는 card.height 유무와 무관하게
        // 항상 크롭돼야 하므로 overflow는 조건 없이 hidden으로 둔다.
        overflow: "hidden",
      }}
    >
      <CardContent
        card={card}
        editing={editing}
        onChange={(content) => setContent(card.id, content)}
        onCommitEdit={() => setEditing(null)}
      />

      {/*
       * FEAT-pen-mode-ux B2 (AC-2): 메모 카드 "그릴 수 있음" 하이라이트.
       * 펜 모드에서 카드 위로 커서를 올리면(group-hover) 점선 링이 들떠 그릴 수 있음을 알린다.
       * pointer-events-none이라 그리기(DrawingLayer)·드래그 가드를 가로막지 않는다.
       */}
      {penDrawable && (
        <div
          aria-hidden="true"
          data-pen-drawable="true"
          className="pointer-events-none absolute inset-0 z-[30] rounded-[8px] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ boxShadow: "inset 0 0 0 2px rgba(79, 124, 243, 0.55)" }}
        />
      )}

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

  // FEAT-eject: 서브캔버스 밖(루트/시스템)이면 우클릭 메뉴 없이 카드만 렌더.
  // 편집/펜 모드에선 트리거를 비활성화해 브라우저 기본 메뉴(복사·붙여넣기 등)를 살린다.
  if (ancestors.length === 0) return cardNode;

  const parent = ancestors[ancestors.length - 1];
  const crumbLabel = (id: string, name: string) =>
    id === SYSTEM_BOARD_ID
      ? t("workspace.boardPicker.system")
      : name.trim() === ""
        ? t("cards.board.unnamed")
        : name;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild disabled={editing || penMode}>
        {cardNode}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[var(--z-panel)] min-w-44 rounded-lg border border-border bg-bg p-1 shadow-card-lift">
          <ContextMenu.Item
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel"
            onSelect={() => void moveCardToBoard(card.id, parent.id)}
          >
            {t("workspace.subcanvas.eject.toParent")}
          </ContextMenu.Item>
          {/* 조상이 여러 단계면 각 조상으로 보내는 하위 항목 — 즉시 부모가 위 기본 항목. */}
          {ancestors.length > 1 && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel data-[state=open]:bg-panel">
                <span>{t("workspace.subcanvas.eject.toAncestor")}</span>
                <span className="text-text-soft">›</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="z-[var(--z-panel)] min-w-44 rounded-lg border border-border bg-bg p-1 shadow-card-lift">
                  {ancestors.map((a) => (
                    <ContextMenu.Item
                      key={a.id}
                      className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel"
                      onSelect={() => void moveCardToBoard(card.id, a.id)}
                    >
                      {crumbLabel(a.id, a.name)}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
