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
 * 가로폭 동기 (cycle 2026-05-28):
 *  모달 width = card.width 픽셀. 펜 좌표가 카드 content box 절대 px이므로 가로
 *  폭이 일치해야 카드↔모달 사이 stroke가 같은 좌표(끊김 없이)에 보인다. 세로
 *  (height)만 80vh로 펼쳐 긴 메모 편집 여유를 둔다. 보드 zoom은 모달에 적용
 *  안 됨(모달은 viewport-fixed)이므로 zoom 100% 기준 카드 크기와 1:1 매칭.
 *
 * 펜 overlay:
 *  카드의 손글씨(card.overlay)를 본문 위에 같이 렌더한다. 좌표는 카드 content
 *  box 기준 절대 px이며 스케일하지 않는다(카드 리사이즈가 펜을 늘리지 않는 것과
 *  동일). 헤더의 펜/지우개 토글로 그리기 모드(active)를 켜면 그 위에 덧그리거나
 *  지울 수 있고, 꺼두면 SVG가 pointer-events:none → 클릭이 본문(텍스트 편집)
 *  으로 통과한다. 변경은 setOverlay로 카드와 동일한 overlay 데이터에 영속된다.
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
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex h-[80vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-card-lift focus:outline-none"
          // width는 card.width로 동기 — 펜 좌표 1:1 매칭(끊김 방지).
          style={card ? { width: card.width } : undefined}
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
                />
              }
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
