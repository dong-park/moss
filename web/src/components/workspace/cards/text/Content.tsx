"use client";

import MarkdownEditor from "../_shared/MarkdownEditor";
import { cardSurface } from "../_shared/surface";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Text → 마크다운 메모 (FEAT-markdown-memo-pen)
 *
 * 종류를 고르던 code/checklist/highlight가 이 한 장으로 통합됐다.
 * 마크다운 문법이 곧 블록: ```코드 · # 제목 · - [ ] 체크 · > 인용.
 * Milkdown 라이브 프리뷰(D1/D2) — 타이핑하며 렌더.
 *
 * editing↔commit 라이프사이클은 기존 카드와 동일:
 *  - editing=false → readonly 렌더(드래그/선택 가능)
 *  - editing=true  → 편집(더블클릭 진입), blur/Esc commit
 *
 * MarkdownEditor는 내부 mounted 가드로 client에서만 ProseMirror를 생성한다
 * (web/AGENTS.md: Next 16 서버 렌더에서 window 미정의 크래시 방지).
 * inset은 cards/v2/text.png 종이 영역 측정값(top1% left1% right3% bottom4%).
 * ───────────────────────────────────────────────────────────── */

export function TextCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  return (
    <div
      className="relative h-full"
      style={{ minHeight: 80, borderRadius: 6, ...cardSurface("text") }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCommitEdit();
        }
      }}
    >
      <div
        className="moss-md absolute flex flex-col overflow-auto px-2 py-1.5"
        style={{ top: "1%", left: "1%", right: "3%", bottom: "4%" }}
        // 편집 중에는 카드 드래그 시작(mousedown)을 막아 텍스트 선택/커서를 보호.
        onMouseDown={(e) => {
          if (editing) e.stopPropagation();
        }}
      >
        <MarkdownEditor
          value={card.content}
          editable={editing}
          onChange={onChange}
          onBlur={onCommitEdit}
        />
      </div>
    </div>
  );
}
