"use client";

import { useMemo } from "react";
import { blocksToMarkdown } from "@/state/cardContent";
import { useWorkspace } from "@/state/workspace";
import MarkdownEditor from "../_shared/MarkdownEditor";
import { MemoSaveGuard } from "../_shared/editor/MemoSaveGuard"; // W1 자동저장 유실 가드
import { DrawingLayer } from "../_shared/DrawingLayer";
import { MultitabConflictBanner } from "../_shared/MultitabConflictBanner"; // W8
import { MEMO_CONTENT_WIDTH } from "../_shared/memoLayout";
import { MemoTitleRow } from "../_shared/MemoTitleRow"; // FEAT-memo-title
import {
  focusMemoBodyStart,
  isFocusInSameCard,
} from "../_shared/memoTitleFocus"; // FEAT-memo-title-front-edit
import { BacklinkPanel } from "../_shared/editor/BacklinkPanel"; // W5 위키링크 백링크 패널
import { MemoFrontBadges } from "../_shared/MemoFrontBadges"; // FEAT-sticky-redesign n5
import { memoTint } from "../../memoVariety"; // FEAT-memo-variety 색조
import type { CardContentProps } from "../_shared/types";

// 종이 사진. 색조 층 mask도 같은 파일이어야 종이 바깥 투명부에 색이 안 칠해진다.
const MEMO_PAPER = 'url("/cards/v2/text.png") 0 0 / 100% 100% no-repeat';

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
 *
 * FEAT-sticky-redesign n5 — 앞면(editing=false)은 창과 같은 배치를 그대로
 * 쓴다(1:1, 앞면 전용 숨김·축소 없음 — memoLayout.ts 규칙). 카드 박스가
 * overflow:hidden으로 위부터 크롭할 뿐이다. blockView.ts가 readonly를 읽어
 * 재생·열기 버튼만 숨기고 박스 높이는 창과 동일하게 유지한다(펜 좌표 1:1).
 * 하단에는 링크·녹음·파일 개수 배지(MemoFrontBadges)를 겹쳐 올린다(이미지는
 * 배지 대상 아님 — 실물로 위에 이미 보인다). 배지·이미지·블록 막대를 누르면
 * 메모 창을 연다 — 일반 본문 텍스트 클릭은 카드 선택/드래그로 남긴다.
 * ───────────────────────────────────────────────────────────── */

export function TextCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const markdown = useMemo(() => blocksToMarkdown(card.content), [card.content]);

  // FEAT-memo-title-front-edit: 제목 편집 — 타이핑은 setTitle, 확정은 commitTitle.
  const setTitle = useWorkspace((s) => s.setTitle);
  const commitTitle = useWorkspace((s) => s.commitTitle);

  // f2 blur 가드: 새 포커스 대상이 같은 카드 안이면 편집을 끝내지 않는다(AC-3).
  // 카드 밖(또는 포커스 소실)이면 제목을 확정하고 편집 종료(AC-4).
  const handleBlur = (relatedTarget: EventTarget | null) => {
    if (!editing) return;
    if (isFocusInSameCard(relatedTarget, card.id)) return;
    commitTitle(card.id);
    onCommitEdit();
  };
  // Esc 등 명시적 종료 — 제목을 확정하고 편집 종료(AC-4).
  const handleCommitEdit = () => {
    commitTitle(card.id);
    onCommitEdit();
  };

  // FEAT-markdown-memo-pen: 펜 overlay 상태(보드 전역). 그림이 있거나 펜 모드면 표시.
  const penMode = useWorkspace((s) => s.penMode);
  const penTool = useWorkspace((s) => s.penTool);
  const penWidth = useWorkspace((s) => s.penWidth);
  const setOverlay = useWorkspace((s) => s.setOverlay);
  const setExpandedCard = useWorkspace((s) => s.setExpandedCard);
  const showOverlay = penMode || !!card.overlay;

  // FEAT-sticky-redesign n5: 앞면에서 이미지·블록 막대를 누르면 메모 창을 연다.
  // globals.css가 readonly 에디터의 <a>는 여전히 pointer-events:none으로 막지만
  // <img>는 n5에서 풀었다(클릭이 실제로 img를 히트해야 이 핸들러가 동작한다).
  //
  // 2단계 리뷰 P1-5: 이미지가 링크(<a href="javascript:...">)로 감싸여 있으면
  // 브라우저 기본 동작(링크 이동)이 클릭과 동시에 발생할 수 있다 — preventDefault로
  // 그 기본 이동을 막는다. autolink.ts·state/blocks.ts가 허용 스킴(http/https/
  // mailto)만 링크로 만들도록 별도로 막고 있지만, 방어를 한 겹 더 둔다.
  // 재심사 P1: 가운데 클릭(auxclick)과 키보드로 활성화된 <a>도 같은 경로로 막는다.
  const onFrontClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editing) return;
    const target = e.target as HTMLElement;
    if (target.closest("img, [data-moss-block], a")) {
      e.preventDefault();
      e.stopPropagation();
      setExpandedCard(card.id);
    }
  };

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{
        minHeight: 80,
        borderRadius: 6,
        // background-size 100% 100%로 카드 박스에 맞춰 늘어나게 — content가
        // 커져 카드가 auto-grow하면 포스트잇 비주얼도 같이 늘어난다.
        background: MEMO_PAPER,
        // 색조 층(z-index:-1)이 이 배경 위, 모든 자식 아래에 깔리게 스택을 가둔다.
        isolation: "isolate",
      }}
      onClick={onFrontClick}
      onAuxClick={onFrontClick}
      onKeyDown={(e) => {
        // Milkdown(prose-mirror)에 ESC가 도달하면 onCommitEdit.
        if (e.key === "Escape") {
          e.preventDefault();
          handleCommitEdit();
        }
      }}
    >
      {/* FEAT-memo-variety: 노랑 색조 — 종이 png와 같은 mask로 잘라 바깥 투명부엔
        * 칠하지 않고, multiply로 종이 결을 비친다. z-index:-1 + 루트 isolation이라
        * 형제 순서·position과 무관하게 모든 내용 아래에 있다. */}
      <div
        aria-hidden="true"
        data-memo-tint
        className="pointer-events-none absolute inset-0"
        style={{
          background: memoTint(card.id),
          mixBlendMode: "multiply",
          zIndex: -1,
          borderRadius: 6,
          WebkitMask: MEMO_PAPER,
          mask: MEMO_PAPER,
        }}
      />
      <MultitabConflictBanner cardId={card.id} /> {/* W8: 다른 탭 변경 배너 */}
      {/* FEAT-memo-title: 제목 줄 — 펜 1:1을 위해 본문 컬럼(relative)과 형제로 둔다.
        * 읽기 전용은 제목 없으면 null. 편집 모드는 빈 값이어도 입력 줄을 그린다(AC-1). */}
      <MemoTitleRow
        title={card.title ?? ""}
        editable={editing}
        onCommit={(title) => setTitle(card.id, title)}
        onBlur={handleBlur}
        onEnter={() => focusMemoBodyStart(card.id)}
        onArrowDown={() => focusMemoBodyStart(card.id)}
      />
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
          cardId={card.id}
          onChange={onChange}
          onBlur={handleBlur}
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
        <BacklinkPanel card={card} />
      </div>
      {/* FEAT-sticky-redesign n5: 앞면 전용 배지 — 카드 박스 기준 하단에 겹쳐 올린다
        * (컬럼이 아니라 이 바깥 relative 박스 기준이라야 카드 폭 안에 항상 붙는다). */}
      {!editing && <MemoFrontBadges markdown={markdown} onActivate={() => setExpandedCard(card.id)} />}
      <MemoSaveGuard cardId={card.id} content={markdown} editing={editing} />
    </div>
  );
}
