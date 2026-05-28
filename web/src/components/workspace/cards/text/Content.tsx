"use client";

import { useMemo } from "react";
import { blocksToMarkdown } from "@/state/cardContent";
import MarkdownEditor from "../_shared/MarkdownEditor";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * 글(포스트잇) 카드 — Milkdown 인라인 에디터.
 *
 * 카드와 모달이 같은 Milkdown 렌더러로 통일돼 markdown(heading/list 등)이
 * 양쪽에서 동일하게 보이고, 펜 overlay가 같은 글자 위치에 정렬된다(이전
 * block-stack 아키텍처에서 발생하던 어긋남 해소).
 *
 * 진입 (FEAT-card-entry-mode §6): editable=true 전환 시 Milkdown 인스턴스가
 * 재마운트되며 자체 focus 핸들러로 자동 포커스.
 *
 * 마이그레이션 호환: 아직 v3 upgrade를 거치지 않은 카드(content가 CardBlock[]
 * JSON)는 blocksToMarkdown으로 표시 시점에 markdown으로 변환해 보여주고,
 * 사용자가 편집하면 onChange로 markdown이 저장돼 영구 마이그레이션된다.
 * ───────────────────────────────────────────────────────────── */

export function TextCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const markdown = useMemo(() => blocksToMarkdown(card.content), [card.content]);

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{
        minHeight: 80,
        borderRadius: 6,
        // background-size 100% 100%로 카드 박스에 맞춰 늘어나게 — content가
        // 커져 카드가 auto-grow하면 포스트잇 비주얼도 같이 늘어난다.
        background: `url("/cards/v2/text.png") 0 0 / 100% 100% no-repeat`,
      }}
      onKeyDown={(e) => {
        // Milkdown(prose-mirror)에 ESC가 도달하면 onCommitEdit.
        if (e.key === "Escape") {
          e.preventDefault();
          onCommitEdit();
        }
      }}
    >
      {/* normal-flow 컨테이너 — content 높이가 카드 root에 전파돼 card.height
        * 미지정 시 DraggableCard가 auto-grow한다. 모달의 줌 wrapper padding과
        * 동일(6px 9px) — 카드/모달의 글자 시작 오프셋이 일치해야 펜 좌표가
        * 양쪽에서 같은 글자를 가리킴. */}
      <div style={{ padding: "6px 9px" }}>
        <MarkdownEditor
          value={markdown}
          editable={editing}
          onChange={onChange}
          onBlur={onCommitEdit}
        />
      </div>
    </div>
  );
}
