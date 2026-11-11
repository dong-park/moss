"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { parseHandwriting } from "@/state/cardContent";
import { MEMO_CONTENT_WIDTH } from "./_shared/memoLayout";
import styles from "./_shared/memoMobile.module.css";
import { memoTint } from "../memoVariety";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-expand — 메모(text) 카드 펼치기 창.
 *
 * 카드의 펼치기 버튼이 setExpandedCard(id)로 연다. expandedCardId를 구독해 해당
 * 카드를 편집한다. 창은 카드 색과 같은 종이 한 장이다 — 머리 막대와 상단 서식 툴바가
 * 없고, 서식은 글자를 긁으면 뜨는 버블로만 바꾼다. 편집은 setContent로 실시간 반영·영속.
 *
 * 종이 구조 (spec/memo-paper-expand):
 *  Dialog.Content가 곧 종이다 — 폭 min(792px,94vw) × 높이 PAPER_H, 모서리 6px.
 *  배경은 창을 열 때 한 번 정한다: paper 앞면이면 카드 앞면과 같은 text.png + 같은
 *  mask의 색조 층(multiply), 할 일·링크 앞면이면 흰 단색. 상자 그림자는 두지 않는다 —
 *  text.png의 투명 가장자리 밖으로 사각 틀이 비친다. paper 종이의 아래 padding은 종이
 *  높이의 17%로, 늘어난 text.png의 말린 모서리 위로 글자가 올라가지 않게 한다. 말린
 *  모서리가 없는 흰 종이는 아래 40px다. 높이 상한 100vh−88px는 종이 위·아래를 44px 이상
 *  비운다 — 위는 서식 버블, 아래는 버튼 줄 자리다.
 *  펜·지우개·✕ 버튼 줄은 Content의 자식으로 두고 종이 박스 밖 오른쪽 아래에 얹는다
 *  (Content 밖 형제면 Radix가 body에 건 pointer-events:none 때문에 눌리지 않는다).
 *  위에 두면 종이 위 끝 근처 선택의 버블이 버튼을 덮어 펜 클릭이 서식 버튼에 닿았다.
 *  버블은 늘 선택 위에만 떠서 종이 아래로는 내려가지 않는다.
 *  본문 넘침은 안쪽 스크롤 영역(ExpandedMarkdownEditor)이 맡는다.
 *
 * 펜 overlay:
 *  DrawingLayer를 본문 고정 폭 컬럼([[MEMO_CONTENT_WIDTH]]) 안에 1:1로 얹는다 — 저장된
 *  선(card.overlay)이 이 컬럼 좌표다. 카드 앞면은 제목만 보여 펜 선은 이 창에서만 보인다.
 *  펜/지우개 토글로 그리기 모드(active)를 켜면 덧그리거나 지울 수 있고, 꺼두면 SVG가
 *  pointer-events:none → 클릭이 본문(텍스트 편집)으로 통과한다. 변경은 setOverlay로 영속된다.
 *
 * 열림 모션은 다른 모달과 같다. 새 animation 규칙을 넣지 않는다.
 * 닫기: Esc / 오버레이 클릭 / ✕ → close() → setExpandedCard(null).
 * 마운트는 page.tsx 루트에서 1회 (전역 오버레이, BoardDeleteDialog와 동일 패턴).
 * ───────────────────────────────────────────────────────────── */
// 종이 높이. 86vh와 792px 상한에 더해 100vh−88px로 종이 위(버블)·아래(버튼 줄 28px + 간격)
// 자리를 남긴다.
export const PAPER_H = "min(792px, 86vh, calc(100vh - 88px))";

/** 종이 padding. 말린 모서리는 text.png(paper 종이)에만 있어 paper만 아래를 종이 높이의
 * 17%로 비운다(늘어난 text.png의 말린 부분은 높이의 약 11~16%). 흰 단색 종이는 40px다.
 * jsdom은 중첩 min()이 든 calc를 버리므로 값은 이 함수로 테스트한다. */
export function paperPadding(isPaper: boolean): string {
  return isPaper ? `12px 24px calc(${PAPER_H} * 0.17)` : "12px 24px 40px";
}

export function MemoExpandDialog() {
  const t = useT();
  const returnFocus = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => setViewport({ height: visual.height, top: visual.offsetTop });
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, []);
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
          className={`fixed left-1/2 top-1/2 z-[var(--z-modal)] flex -translate-x-1/2 -translate-y-1/2 flex-col focus:outline-none ${styles.dialog}`}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus({ preventScroll: true });
            }
          }}
          style={{
            width: "min(792px, 94vw)",
            height: PAPER_H,
            padding: paperPadding(isPaper),
            borderRadius: 6,
            background: isPaper ? MEMO_PAPER : "var(--color-card-base)",
            isolation: "isolate",
            ...(viewport ? { "--memo-viewport-height": `${viewport.height}px`, "--memo-viewport-top": `${viewport.top}px` } : {}),
          } as CSSProperties}
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
          {/* 펜·지우개·✕: 종이 박스 밖 오른쪽 아래(버블과 자리를 나눈다). Content의 자식이라
           * Radix의 body pointer-events:none 영향을 받지 않고 눌린다. */}
          <div
            data-memo-paper-tools
            className={`absolute top-full right-0 mt-2 flex items-center gap-1 ${styles.tools}`}
          >
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
                canonical={drawing || parseHandwriting(card.overlay ?? "").paths.length > 0}
                value={card.content}
                onChange={(md) => setContent(card.id, md)}
                // FEAT-memo-title: 본문 위 제목 줄 — 스크롤 영역 안, 창에서만 편집(D1).
                // Enter는 본문 맨 앞으로 포커스를 넘긴다(AC-7). 펜 overlay는 본문 컬럼
                // (고정 폭) 안에 1:1로 얹힌다 — 저장된 선과 같은 좌표공간. drawing=false면
                // pointer-events:none → 클릭이 편집으로 통과.
                titleSlot={
                  <MemoExpandTitleSlot
                    title={card.title ?? ""}
                    onCommit={(title) => setTitle(card.id, title)}
                  />
                }
                overlay={
                  <DrawingLayer
                    coordinateWidth={MEMO_CONTENT_WIDTH}
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
