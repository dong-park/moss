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
 * FEAT-sticky-redesign n8: 독(Dock) 도구를 끄는 동안 커서를 따라다니는 카드 프리뷰.
 * (구 SidebarDragPreview — 사이드바가 걷히고 독으로 이관되며 이름을 바꿨다.)
 * Dock의 onMouseDown이 setDockDrag로 좌표를 갱신하면 본 컴포넌트가 즉시 따라간다.
 * 표면은 실제 카드 surface와 동일한 PNG(`/cards/v2/{kind}.png`)를 사용 — drop 후 생성되는
 * 카드와 같은 비주얼이라 "그걸로 만들어지는 컴포넌트가 마우스 끝에 달려있다"는 의도와 일치.
 *
 * 2단계 리뷰 P2: 메모판(frame)·파일함(board)은 `/cards/v2/{kind}.png`가 없다
 * (그 kind로 저장되는 실제 카드가 앞면에 쓰는 PNG가 따로 없음 — 함은 시스템
 * 아이콘, 판은 틀 렌더). 드래그 프리뷰는 그 대신 독 아이콘(`/icons/dock/*.png`)을
 * 쓴다 — 빈 상자 대신 무엇이 만들어지는지 알아볼 수 있게.
 */
const PREVIEW_SCALE = 0.55;
const OFFSET_X = 14;
const OFFSET_Y = 14;

/** frame·board는 카드 surface PNG가 없어 독 아이콘으로 대신한다(위 주석). */
const PREVIEW_IMAGE_OVERRIDE: Partial<Record<string, string>> = {
  frame: "/icons/dock/memoboard.png",
  board: "/icons/dock/filebox.png",
};

export function DockDragPreview() {
  const drag = useWorkspace((s) => s.dockDrag);
  if (!drag) return null;

  const kind = kindForTool(drag.toolId);
  const baseW = widthForKind(kind);
  const baseH = Math.min(
    CARD_MAX_HEIGHT,
    Math.max(CARD_MIN_HEIGHT, baseW / aspectForKind(kind)),
  );
  const width = baseW * PREVIEW_SCALE;
  const height = baseH * PREVIEW_SCALE;
  const imageSrc = PREVIEW_IMAGE_OVERRIDE[kind] ?? `/cards/v2/${kind}.png`;
  const backgroundSize = PREVIEW_IMAGE_OVERRIDE[kind] ? "50% 50%" : "contain";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[var(--z-toast)]"
      style={{
        left: drag.screenX + OFFSET_X,
        top: drag.screenY + OFFSET_Y,
        width,
        height,
        background: `url("${imageSrc}") center/${backgroundSize} no-repeat`,
        transform: "rotate(-3deg)",
        transformOrigin: "top left",
        filter:
          "drop-shadow(0 10px 18px rgba(0,0,0,0.18)) drop-shadow(0 2px 4px rgba(0,0,0,0.12))",
        opacity: 0.92,
      }}
    />
  );
}
