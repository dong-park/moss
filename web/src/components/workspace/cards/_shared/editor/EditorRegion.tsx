"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-editor-seams (P0) — 에디터 본문 a11y 래퍼(seam).
 *
 * Milkdown 에디터를 감싸 스크린리더용 role/aria를 붙인다. display:contents라
 * 박스를 만들지 않아 펜 overlay 좌표계(MEMO_CONTENT_WIDTH 컬럼)를 건드리지
 * 않는다 — 시각·정렬 불변. W9(a11y)가 라벨 i18n·단축·포커스 링을 보강하는 표면.
 * ───────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";

export function EditorRegion({
  children,
  editable,
  label = "메모 편집기",
}: {
  children: ReactNode;
  editable: boolean;
  label?: string;
}) {
  return (
    <div
      role="textbox"
      aria-multiline="true"
      aria-readonly={!editable}
      aria-label={label}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}
