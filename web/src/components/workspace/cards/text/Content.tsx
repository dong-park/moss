"use client";

import { useMemo } from "react";
import { blocksToMarkdown } from "@/state/cardContent";
import { useWorkspace } from "@/state/workspace";
import MarkdownEditor from "../_shared/MarkdownEditor";
import { DrawingLayer } from "../_shared/DrawingLayer";
import { MultitabConflictBanner } from "../_shared/MultitabConflictBanner"; // W8
import { MEMO_CONTENT_WIDTH } from "../_shared/memoLayout";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * 글(포스트잇) 카드 — Milkdown 인라인 에디터.
 *
 * 카드와 모달이 같은 Milkdown 렌더러 + 같은 고정 폭([[MEMO_CONTENT_WIDTH]]) 컬럼을
 * 쓴다 → markdown(heading/list 등)이 양쪽에서 동일하게 줄바꿈되고, 펜 overlay가
 * 같은 글자 위치에 정렬된다. 카드는 card.width × card.height 박스(overflow hidden)로
 * 이 컬럼을 크롭하고, 펼침 모달은 전체를 다 보여준다("펼치면 항상 최대"). 카드 크기를
 * 바꿔도 컬럼 폭은 불변이라 텍스트가 재배치(reflow)되지 않으므로 펜이 어긋나지 않는다.
 *
 * 펜 overlay: 컬럼 안 1:1 좌표(DrawingLayer)로 텍스트와 같은 좌표공간을 공유한다.
 * 펜 모드가 아니어도 그림이 있으면 표시하되, active=false면 pointer-events:none →
 * 클릭이 텍스트 편집으로 통과한다.
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

  // FEAT-markdown-memo-pen: 펜 overlay 상태(보드 전역). 그림이 있거나 펜 모드면 표시.
  const penMode = useWorkspace((s) => s.penMode);
  const penTool = useWorkspace((s) => s.penTool);
  const penWidth = useWorkspace((s) => s.penWidth);
  const setOverlay = useWorkspace((s) => s.setOverlay);
  const showOverlay = penMode || !!card.overlay;

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
      <MultitabConflictBanner cardId={card.id} /> {/* W8: 다른 탭 변경 배너 */}
      {/* 고정 폭 컬럼 — 카드/모달 공통 좌표계. 카드 폭보다 넓으면 위 overflow-hidden이
        * 우측을 크롭한다. padding 6/9 + text-[13px]은 모달 컬럼과 정확히 일치해야
        * 펜이 같은 글자를 가리킨다. position:relative로 펜 overlay의 기준 박스. */}
      <div
        className="moss-md relative text-[13px]"
        style={{ width: MEMO_CONTENT_WIDTH, padding: "6px 9px" }}
      >
        <MarkdownEditor
          value={markdown}
          editable={editing}
          onChange={onChange}
          onBlur={onCommitEdit}
        />
        {showOverlay && (
          <DrawingLayer
            value={card.overlay ?? ""}
            active={penMode}
            penWidth={penWidth}
            tool={penTool}
            onChange={(json) => setOverlay(card.id, json)}
          />
        )}
      </div>
    </div>
  );
}
