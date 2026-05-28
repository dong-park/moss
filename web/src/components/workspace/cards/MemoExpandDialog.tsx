"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { ExpandedMarkdownEditor } from "./_shared/MarkdownEditor";
import { DrawingLayer, type DrawingTool } from "./_shared/DrawingLayer";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-expand — 메모(text) 카드 펼치기 모달.
 *
 * 카드의 펼치기 버튼이 setExpandedCard(id)로 연다. 여기서는 expandedCardId를
 * 구독해 해당 카드를 크게(거의 전체 화면) 편집한다. 상단 서식 프리셋 툴바 +
 * Milkdown 본문(ExpandedMarkdownEditor). 편집은 setContent로 실시간 반영·영속.
 *
 * 크기 (cycle 2026-05-28 b):
 *  모달은 w-[90vw] max-w-3xl × h-[80vh]로 본격 펼친다 — 펼치기의 의도(넓은
 *  편집 공간) 회복. 펜 stroke는 viewBox로 카드 비율 유지하며 함께 확대되므로
 *  width=card.width 동기 없이도 카드/모달 좌표가 일치한다(viewBox 좌표계 공유).
 *
 * 펜 overlay:
 *  카드의 손글씨(card.overlay)를 본문 위에 같이 렌더한다. DrawingLayer에 viewBox
 *  ={card.width × (card.height ?? card.width)}를 넘겨 비율 유지하며 모달 본문에
 *  맞춰 확대(preserveAspectRatio="xMinYMin meet")한다 — 펼치면 펜 자국도 같이
 *  크게 보인다. 새로 그릴 때는 toLocal이 픽셀→viewBox 좌표로 환산해 카드와
 *  동일 좌표공간에 저장되므로 카드/모달 어디서 그려도 호환된다. 헤더의 펜/지우개
 *  토글로 그리기 모드(active)를 켜면 덧그리거나 지울 수 있고, 꺼두면 SVG가
 *  pointer-events:none → 클릭이 본문(텍스트 편집)으로 통과한다. 변경은
 *  setOverlay로 카드와 동일한 overlay 데이터에 영속된다.
 *
 * 닫기: Esc / 오버레이 클릭 / 완료 버튼 → setExpandedCard(null).
 * 마운트는 page.tsx 루트에서 1회 (전역 오버레이, BoardDeleteDialog와 동일 패턴).
 * ───────────────────────────────────────────────────────────── */
export function MemoExpandDialog() {
  const t = useT();
  const expandedCardId = useWorkspace((s) => s.expandedCardId);
  const setExpandedCard = useWorkspace((s) => s.setExpandedCard);
  const setContent = useWorkspace((s) => s.setContent);
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

  // id는 있는데 카드가 사라진 경우(삭제 등) — store 정리가 처리하지만 방어적으로 닫힘.
  const open = expandedCardId !== null && card !== null;
  const close = () => {
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

  const toolBtn = (active: boolean) =>
    [
      "flex h-7 items-center justify-center rounded px-2 text-xs transition-colors cursor-pointer",
      active
        ? "bg-active-bg text-active-fg"
        : "text-text-soft hover:bg-panel hover:text-text",
    ].join(" ");

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex h-[80vh] w-[90vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-card-lift focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <Dialog.Title className="text-sm font-semibold text-text">
              {t("workspace.memoEditor.title")}
            </Dialog.Title>
            <div className="flex items-center gap-1">
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
                className="ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-soft transition-colors hover:bg-panel hover:text-text"
                aria-label={t("workspace.memoEditor.close")}
              >
                ✕
              </Dialog.Close>
            </div>
          </div>

          {card && (
            <ExpandedMarkdownEditor
              key={card.id}
              value={card.content}
              onChange={(md) => setContent(card.id, md)}
              // 펜 overlay는 본문 영역(툴바 아래) 안에만 렌더된다. drawing=false면
              // pointer-events:none → 클릭이 텍스트 편집으로 통과한다.
              overlay={
                <DrawingLayer
                  value={card.overlay ?? ""}
                  active={drawing}
                  penWidth={penWidth}
                  tool={tool}
                  onChange={(json) => setOverlay(card.id, json)}
                  // 카드 dimensions을 viewBox로 — 비율 유지하며 모달 본문에 맞춰 확대.
                  // height 미지정(auto)이면 정사각형 fallback(width=height).
                  viewBox={{
                    width: card.width,
                    height: card.height ?? card.width,
                  }}
                />
              }
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
