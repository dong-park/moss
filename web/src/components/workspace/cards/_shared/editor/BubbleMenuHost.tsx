"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-editor-seams (P0) — 인카드 버블 툴바 호스트.
 *
 * extensions.ts의 bubbleSlot이 선택 좌표를 외부 store에 쓰면, 이 컴포넌트가
 * 구독해 선택 위에 floating 툴바를 그린다. 항목(bubbleMenuItems)이 0개면
 * 절대 렌더하지 않는다(P0 AC-4). W3가 항목을 채우고 스타일을 다듬는다.
 * position:fixed + 뷰포트 좌표(coordsAtPos). body로 portal한다 — 조상에 transform이
 * 있으면 fixed가 그 조상 기준이 된다. world layer의 viewport transform(팬·줌)이 그렇고,
 * 메모 기울기까지 붙으면 카드 overflow:hidden에 잘리기까지 한다.
 * ───────────────────────────────────────────────────────────── */

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  bubbleMenuItems,
  subscribeBubble,
  getBubbleState,
  getBubbleServerSnapshot,
} from "./extensions";

export function BubbleMenuHost() {
  const state = useSyncExternalStore(
    subscribeBubble,
    getBubbleState,
    getBubbleServerSnapshot,
  );

  // 버블 폭을 재서 스크롤 영역 좌우(state.minLeft~maxLeft)와 화면 좌우 8px 안으로 당긴다 —
  // 줄 머리를 긁어도 버블이 종이 밖·화면 밖으로 나가지 않게. 범위가 버블보다 좁으면 화면만
  // 지킨다. React가 left를 다시 쓸 때마다 다시 당긴다.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const half = el.offsetWidth / 2;
    const screenMin = 8 + half;
    const screenMax = Math.max(screenMin, window.innerWidth - 8 - half);
    let min = Math.max(screenMin, state.minLeft + half);
    let max = Math.min(screenMax, state.maxLeft - half);
    if (max < min) {
      min = screenMin;
      max = screenMax;
    }
    el.style.left = `${Math.min(Math.max(state.left, min), max)}px`;
  });

  if (!state.open || !state.view || bubbleMenuItems.length === 0) return null;
  const view = state.view;

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      data-bubble-toolbar
      aria-label="서식"
      // 배경은 bg-panel(#fff). 예전 bg-surface는 정의된 색 토큰이 없어 투명했다 — 종이 위에서
      // 아래 글자가 버튼 글자와 겹쳐 보였다. 버블은 늘 기준 y(state.top) 위 6px에 뜬다.
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-md border border-border bg-panel px-1 py-0.5 shadow-lg"
      // Radix 모달이 body에 건 pointer-events:none을 상속하면 클릭이 오버레이로 뚫려 창이 닫힌다.
      style={{ left: state.left, top: state.top - 6, pointerEvents: "auto" }}
    >
      {bubbleMenuItems.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.aria}
          title={item.aria}
          data-bubble-btn={item.id}
          aria-pressed={item.isActive?.(view) ?? undefined}
          // 클릭이 에디터 선택을 빼앗지 않게 — preventDefault로 선택 유지.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => item.run(view)}
          className="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded px-1.5 text-sm text-text-muted transition-colors hover:bg-panel hover:text-text aria-pressed:bg-panel aria-pressed:text-text"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
