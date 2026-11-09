"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MilkdownProvider } from "@milkdown/react";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { ExpandedMarkdownEditor } from "./_shared/MarkdownEditor";
import { DrawingLayer, type DrawingTool } from "./_shared/DrawingLayer";
import { MemoExpandTitleSlot } from "./_shared/MemoExpandTitleSlot"; // FEAT-memo-title
import { PhotoLightbox } from "./photo/PhotoLightbox"; // FEAT-photo-card
import { MEMO_PAPER } from "./text/Content";
import { memoFace } from "./text/face";
import { memoTint } from "../memoVariety";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-expand — 메모(text) 카드 펼치기 창.
 *
 * 카드의 펼치기 버튼이 setExpandedCard(id)로 연다. expandedCardId를 구독해 해당
 * 카드를 편집한다. 창은 카드 색과 같은 종이 한 장이다 — 머리 막대와 상단 서식 툴바가
 * 없고, 서식은 글자를 긁으면 뜨는 버블로만 바꾼다. 편집은 setContent로 실시간 반영·영속.
 *
 * 종이 구조 (spec/memo-paper-expand):
 *  Dialog.Content가 곧 종이다 — 폭 min(792px,94vw) × 높이 min(792px,86vh), padding
 *  12px 24px 40px, 모서리 6px. 배경은 창을 열 때 한 번 정한다: paper 앞면이면 카드
 *  앞면과 같은 text.png + 같은 mask의 색조 층(multiply), 할 일·링크 앞면이면 흰 단색.
 *  펜·지우개·✕ 버튼 줄은 Content의 자식으로 두고 종이 박스 밖 오른쪽 위에 얹는다
 *  (Content 밖 형제면 Radix가 body에 건 pointer-events:none 때문에 눌리지 않는다).
 *  본문 넘침은 안쪽 스크롤 영역(ExpandedMarkdownEditor)이 맡는다.
 *
 * 고정 폭 1:1 ("펼치면 항상 최대"):
 *  본문은 카드와 동일한 고정 폭 컬럼([[MEMO_CONTENT_WIDTH]])으로 1:1 배치돼 줄바꿈이
 *  카드와 같다. 자세한 건 ExpandedMarkdownEditor.
 *
 * 펜 overlay:
 *  DrawingLayer를 본문 컬럼 안에 1:1로 얹는다 — 카드와 동일 좌표공간이라 카드에서
 *  그린 stroke가 같은 글자 위에 정렬된다. 펜/지우개 토글로 그리기 모드
 *  (active)를 켜면 덧그리거나 지울 수 있고, 꺼두면 SVG가 pointer-events:none →
 *  클릭이 본문(텍스트 편집)으로 통과한다. 변경은 setOverlay로 영속된다.
 *
 * 열림 모션은 globals.css의 전역 dialog-content 규칙(moss-scale-in)을 그대로 쓴다.
 * 닫기: Esc / 오버레이 클릭 / ✕ → close() → setExpandedCard(null).
 * 마운트는 page.tsx 루트에서 1회 (전역 오버레이, BoardDeleteDialog와 동일 패턴).
 * ───────────────────────────────────────────────────────────── */
export function MemoExpandDialog() {
  const t = useT();
  const expandedCardId = useWorkspace((s) => s.expandedCardId);
  const setExpandedCard = useWorkspace((s) => s.setExpandedCard);
  const setContent = useWorkspace((s) => s.setContent);
  const setTitle = useWorkspace((s) => s.setTitle);
  const commitTitle = useWorkspace((s) => s.commitTitle);
  const setOverlay = useWorkspace((s) => s.setOverlay);
  const penWidth = useWorkspace((s) => s.penWidth);
  // expandedCardId가 가리키는 카드만 좁혀 구독 — 다른 카드 변경에 리렌더되지 않게.
  const card = useWorkspace((s) =>
    s.expandedCardId
      ? (s.cards.find((c) => c.id === s.expandedCardId) ?? null)
      : null,
  );

  // 모달-로컬 그리기 상태. 보드 전역 penMode와 분리해 모달이 보드 상태를 건드리지
  // 않게 한다(닫으면 보드는 그대로 텍스트 모드). 굵기는 store penWidth를 재사용.
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("pen");

  // 종이 색은 창을 열 때 한 번 정해 고정한다 — 열린 동안 본문을 고쳐 앞면 판정이
  // 바뀌어도 종이가 갑자기 다른 색이 되지 않게.
  // id는 있는데 카드가 사라진 경우(삭제 등) — store 정리가 처리하지만 방어적으로 닫힘(open=false).
  const open = expandedCardId !== null && card !== null;
  const [paper, setPaper] = useState<{ id: string; isPaper: boolean; tint: string } | null>(null);
  if (open && card && paper?.id !== card.id) {
    setPaper({
      id: card.id,
      isPaper: memoFace(card.content).t === "paper",
      tint: memoTint(card.id, card.color),
    });
  } else if (!open && paper) {
    setPaper(null);
  }

  const close = () => {
    // FEAT-memo-title-front-edit AC-7: 창을 닫을 때 제목 앞뒤 공백을 확정한다.
    if (card) commitTitle(card.id);
    setDrawing(false); // 다음에 열 때 텍스트 모드로 시작.
    setExpandedCard(null);
  };

  // 같은 도구를 다시 누르면 그리기 모드 해제(텍스트 편집으로 복귀), 아니면 그 도구로 켠다.
  const selectTool = (next: DrawingTool) => {
    if (drawing && tool === next) {
      setDrawing(false);
      return;
    }
    setTool(next);
    setDrawing(true);
  };

  // FEAT-photo-card: 사진 카드는 편집기 대신 크게 보기 다이얼로그를 띄운다.
  if (card && card.kind === "photo") {
    return <PhotoLightbox card={card} onClose={close} />;
  }

  const toolBtn = (active: boolean) =>
    [
      "flex h-7 items-center justify-center rounded px-2 text-xs transition-colors cursor-pointer",
      active
        ? "bg-active-bg text-active-fg"
        : "bg-white/90 text-text-soft hover:bg-white hover:text-text",
    ].join(" ");

  const isPaper = paper?.isPaper ?? true;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex -translate-x-1/2 -translate-y-1/2 flex-col shadow-card-lift focus:outline-none"
          style={{
            width: "min(792px, 94vw)",
            height: "min(792px, 86vh)",
            padding: "12px 24px 40px",
            borderRadius: 6,
            background: isPaper ? MEMO_PAPER : "var(--color-card-base)",
            isolation: "isolate",
          }}
          aria-describedby={undefined}
        >
          {/* 보이는 제목은 없다(머리 막대 제거). 스크린리더용 이름만 둔다. */}
          <Dialog.Title className="sr-only">
            {card?.title?.trim() || t("workspace.memoEditor.fallbackTitle")}
          </Dialog.Title>
          {isPaper && (
            <div
              aria-hidden="true"
              data-memo-tint
              className="pointer-events-none absolute inset-0"
              style={{
                background: paper?.tint,
                mixBlendMode: "multiply",
                zIndex: -1,
                borderRadius: 6,
                WebkitMask: MEMO_PAPER,
                mask: MEMO_PAPER,
              }}
            />
          )}
          {/* 펜·지우개·✕: 종이 박스 밖 오른쪽 위. Content의 자식이라 Radix의
           * body pointer-events:none 영향을 받지 않고 눌린다. */}
          <div className="absolute bottom-full right-0 mb-2 flex items-center gap-1">
            <button
              type="button"
              aria-label={t("workspace.memoEditor.pen")}
              aria-pressed={drawing && tool === "pen"}
              className={toolBtn(drawing && tool === "pen")}
              onClick={() => selectTool("pen")}
            >
              ✏️
            </button>
            <button
              type="button"
              aria-label={t("workspace.memoEditor.eraser")}
              aria-pressed={drawing && tool === "eraser"}
              className={toolBtn(drawing && tool === "eraser")}
              onClick={() => selectTool("eraser")}
            >
              ⌫
            </button>
            <Dialog.Close
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-white/90 text-text-soft transition-colors hover:bg-white hover:text-text"
              aria-label={t("workspace.memoEditor.close")}
            >
              ✕
            </Dialog.Close>
          </div>

          {/* 제목 슬롯이 useInstance()로 본문 에디터와 같은 Milkdown 인스턴스를
           * 잡아야 하므로 Provider를 이 레벨에서 한 번만 제공한다. */}
          <MilkdownProvider>
            {card && (
              <ExpandedMarkdownEditor
                key={card.id}
                value={card.content}
                onChange={(md) => setContent(card.id, md)}
                // FEAT-memo-title: 본문 위 제목 줄 — 스크롤 영역 안, 창에서만 편집(D1).
                // Enter는 본문 맨 앞으로 포커스를 넘긴다(AC-7). 펜 overlay는 본문 컬럼
                // (고정 폭) 안에 1:1로 얹힌다 — 카드와 동일 좌표공간. drawing=false면
                // pointer-events:none → 클릭이 편집으로 통과.
                titleSlot={
                  <MemoExpandTitleSlot
                    title={card.title ?? ""}
                    onCommit={(title) => setTitle(card.id, title)}
                  />
                }
                overlay={
                  <DrawingLayer
                    value={card.overlay ?? ""}
                    active={drawing}
                    penWidth={penWidth}
                    tool={tool}
                    onChange={(json) => setOverlay(card.id, json)}
                  />
                }
              />
            )}
          </MilkdownProvider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
