"use client";

import {
  aspectForKind,
  CARD_MAX_HEIGHT,
  CARD_MIN_HEIGHT,
  kindForTool,
  useWorkspace,
  widthForKind,
} from "@/state/workspace";

/**
 * 사이드바 도구를 끄는 동안 커서를 따라다니는 카드 프리뷰.
 * 사이드바의 onMouseDown이 setSidebarDrag로 좌표를 갱신하면 본 컴포넌트가 즉시 따라간다.
 * 표면은 실제 카드 surface와 동일한 PNG(`/cards/v2/{kind}.png`)를 사용 — drop 후 생성되는
 * 카드와 같은 비주얼이라 "그걸로 만들어지는 컴포넌트가 마우스 끝에 달려있다"는 의도와 일치.
 */
const PREVIEW_SCALE = 0.55;
const OFFSET_X = 14;
const OFFSET_Y = 14;

export function SidebarDragPreview() {
  const drag = useWorkspace((s) => s.sidebarDrag);
  if (!drag) return null;

  const kind = kindForTool(drag.toolId);
  const baseW = widthForKind(kind);
  const baseH = Math.min(
    CARD_MAX_HEIGHT,
    Math.max(CARD_MIN_HEIGHT, baseW / aspectForKind(kind)),
  );
  const width = baseW * PREVIEW_SCALE;
  const height = baseH * PREVIEW_SCALE;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[var(--z-toast)]"
      style={{
        left: drag.screenX + OFFSET_X,
        top: drag.screenY + OFFSET_Y,
        width,
        height,
        background: `url("/cards/v2/${kind}.png") center/contain no-repeat`,
        transform: "rotate(-3deg)",
        transformOrigin: "top left",
        filter:
          "drop-shadow(0 10px 18px rgba(0,0,0,0.18)) drop-shadow(0 2px 4px rgba(0,0,0,0.12))",
        opacity: 0.92,
      }}
    />
  );
}
