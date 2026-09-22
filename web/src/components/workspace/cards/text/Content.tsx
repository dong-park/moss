"use client";

import { useMemo, useRef } from "react";
import { blocksToMarkdown } from "@/state/cardContent";
import { useWorkspace } from "@/state/workspace";
import { MemoSaveGuard } from "../_shared/editor/MemoSaveGuard"; // W1 자동저장 유실 가드
import { MultitabConflictBanner } from "../_shared/MultitabConflictBanner"; // W8
import { MemoTitleRow } from "../_shared/MemoTitleRow"; // FEAT-memo-title
import { isFocusInSameCard } from "../_shared/memoTitleFocus"; // FEAT-memo-title-front-edit
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit"; // ponytail: 기존 파일 재사용, import 누락만 보강
import { MemoFrontBadges } from "../_shared/MemoFrontBadges"; // FEAT-sticky-redesign n5
import { useT } from "@/i18n/Provider";
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
 *
 * FEAT-sticky-redesign n5 — 앞면(editing=false)은 창과 같은 배치를 그대로
 * 쓴다(1:1, 앞면 전용 숨김·축소 없음 — memoLayout.ts 규칙). 카드 박스가
 * overflow:hidden으로 위부터 크롭할 뿐이다. blockView.ts가 readonly를 읽어
 * 재생·열기 버튼만 숨기고 박스 높이는 창과 동일하게 유지한다(펜 좌표 1:1).
 * 하단에는 링크·녹음·파일 개수 배지(MemoFrontBadges)를 겹쳐 올린다(이미지는
 * 배지 대상 아님 — 실물로 위에 이미 보인다). 배지·이미지·블록 막대를 누르면
 * 메모 창을 연다 — 일반 본문 텍스트 클릭은 카드 선택/드래그로 남긴다.
 * ───────────────────────────────────────────────────────────── */

// onChange(본문 변경)는 앞면이 더 이상 본문을 편집하지 않아 쓰지 않는다 — 메모 창이 쓴다.
export function TextCardContent({ card, editing, onCommitEdit }: CardContentProps) {
  const markdown = useMemo(() => blocksToMarkdown(card.content), [card.content]);
  const t = useT();

  // FEAT-memo-title-front-edit: 제목 편집 — 타이핑은 setTitle, 확정은 commitTitle.
  const setTitle = useWorkspace((s) => s.setTitle);
  const commitTitle = useWorkspace((s) => s.commitTitle);

  // 2026-09-22 사용자 결정: 앞면에서 고칠 수 있는 건 제목뿐이다. 본문은 언제나
  // 읽기 전용이고, 내용은 더블클릭으로 여는 메모 창에서 고친다. 한 번 클릭하면
  // (DraggableCard가 setEditing) 이 입력에 포커스가 박힌다.
  const titleInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusOnEdit(titleInputRef, editing);

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

  // 펜 overlay(DrawingLayer)·본문·백링크는 앞면에서 빠졌다 — 메모 창이 맡는다.
  const setExpandedCard = useWorkspace((s) => s.setExpandedCard);

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
        background: `url("/cards/v2/text.png") 0 0 / 100% 100% no-repeat`,
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
      <MultitabConflictBanner cardId={card.id} /> {/* W8: 다른 탭 변경 배너 */}
      {/* 2026-09-22 사용자 결정: 메모지 앞면은 제목 하나만 정가운데에 보여준다.
        * 본문·펜 overlay·백링크는 더블클릭으로 여는 메모 창이 맡는다. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <MemoTitleRow
          title={card.title ?? ""}
          editable={editing}
          variant="center"
          placeholder={t("workspace.memo.placeholder.hint")}
          inputRef={titleInputRef}
          onCommit={(title) => setTitle(card.id, title)}
          onBlur={handleBlur}
          // 앞면은 제목만 고친다 — Enter는 본문으로 내려가지 않고 제목을 확정한다.
          onEnter={handleCommitEdit}
        />
      </div>
      {/* FEAT-sticky-redesign n5: 앞면 전용 배지 — 카드 박스 기준 하단에 겹쳐 올린다
        * (컬럼이 아니라 이 바깥 relative 박스 기준이라야 카드 폭 안에 항상 붙는다). */}
      {/* 제목을 고치는 중에도 배지는 그대로 둔다 — 앞면 배치가 흔들리지 않는다. */}
      <MemoFrontBadges markdown={markdown} onActivate={() => setExpandedCard(card.id)} />
      <MemoSaveGuard cardId={card.id} content={markdown} editing={editing} />
    </div>
  );
}
