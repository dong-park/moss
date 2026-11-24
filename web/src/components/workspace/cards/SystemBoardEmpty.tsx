"use client";

import { useT } from "@/i18n/Provider";

/**
 * FEAT-glass-first-wall n3: 빈 벽 힌트 — 글자 한 줄.
 *
 * 상자·그림자·버튼이 없고 누름을 가로채지 않는다(pointer-events: none).
 * 위치는 아래 가운데, 독(바닥에서 20+56px) 바로 위. 마카 트레이가 생기면
 * 그 위로 올리는 건 wall-marker 몫이다.
 */
export function SystemBoardEmpty() {
  const t = useT();
  return (
    <p
      data-testid="system-board-empty"
      className="pointer-events-none absolute bottom-24 left-1/2 z-[var(--z-panel)] m-0 -translate-x-1/2 whitespace-nowrap text-sm text-text-muted"
      style={{ pointerEvents: "none" }}
    >
      {t("workspace.wallHint")}
    </p>
  );
}
