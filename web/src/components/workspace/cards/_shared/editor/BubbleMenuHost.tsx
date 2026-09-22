"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-editor-seams (P0) — 인카드 버블 툴바 호스트.
 *
 * extensions.ts의 bubbleSlot이 선택 좌표를 외부 store에 쓰면, 이 컴포넌트가
 * 구독해 선택 위에 floating 툴바를 그린다. 항목(bubbleMenuItems)이 0개면
 * 절대 렌더하지 않는다(P0 AC-4). W3가 항목을 채우고 스타일을 다듬는다.
 * position:fixed + 뷰포트 좌표(coordsAtPos). body로 portal한다 — 조상(world layer,
 * FEAT-memo-variety 메모 기울기)에 transform이 있으면 fixed가 그 조상 기준이 되고
 * 카드 overflow:hidden에 잘린다.
 * ───────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
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

  if (!state.open || !state.view || bubbleMenuItems.length === 0) return null;
  const view = state.view;

  return createPortal(
    <div
      role="toolbar"
      aria-label="서식"
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-md border border-border bg-surface px-1 py-0.5 shadow-lg"
      style={{ left: state.left, top: state.top - 6 }}
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
