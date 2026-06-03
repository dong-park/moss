/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-editor-seams (P0) — 메모 에디터 확장 슬롯 레지스트리.
 *
 * MarkdownEditor가 이 모듈의 세 배열을 소비한다. 후속 워커(W2·W3·W5·W6·W10)는
 * "자기 신규 파일 + 여기 등록 1줄"만으로 기능을 붙인다 → 한 파일을 6명이
 * 동시에 만지는 N² 충돌을 피한다([[_squad-memo-production]] §조율점).
 *
 *  ① editorPlugins[]   — Milkdown 플러그인 (W5 wikilink, W10 autolink)
 *  ② pasteHandlers[]   — ProseMirror paste/drop 핸들러 (W6 sanitize → W2 image)
 *  ③ bubbleMenuItems[] — 인카드 선택 시 떠오르는 버블 툴바 (W3)
 *
 * 슬롯이 전부 비어도 동작은 리팩터 전과 동일해야 한다(P0 AC-1).
 * ───────────────────────────────────────────────────────────── */

import type { MilkdownPlugin } from "@milkdown/ctx";
import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener } from "@milkdown/plugin-listener";

import { markdownPlaceholder } from "../markdownPlaceholder";

/* ── ② paste 슬롯 ──────────────────────────────────────────────
 * true 반환 시 기본 동작 차단(소비). 등록 순서대로 시도, 첫 true에서 중단.
 * W6(sanitize)가 먼저, W2(image)가 나중 — 텍스트 정제 후 이미지 추출. */
export type PasteHandler = (
  view: EditorView,
  event: ClipboardEvent | DragEvent,
) => boolean;

export const pasteHandlers: PasteHandler[] = [
  // (W6) sanitizePasteHandler,
  // (W2) imagePasteHandler,
];

const pasteSlot = $prose(
  () =>
    new Plugin({
      props: {
        handlePaste: (view, event) =>
          pasteHandlers.some((h) => h(view, event as ClipboardEvent)),
        handleDrop: (view, event) =>
          pasteHandlers.some((h) => h(view, event as DragEvent)),
      },
    }),
);

/* ── ③ 버블 툴바 슬롯 ──────────────────────────────────────────
 * 인카드 편집 중 비어있지 않은 선택이 생기면 BubbleMenuHost가 노출한다.
 * 항목이 0개면 절대 뜨지 않는다(P0 AC-4). */
export type BubbleMenuItem = {
  id: string;
  label: string;
  aria: string;
  isActive?: (view: EditorView) => boolean;
  run: (view: EditorView) => void;
};

export const bubbleMenuItems: BubbleMenuItem[] = [
  // (W3) ...memoBubbleItems,
];

export type BubbleState = {
  open: boolean;
  left: number;
  top: number;
  view: EditorView | null;
};

const CLOSED: BubbleState = { open: false, left: 0, top: 0, view: null };
let bubbleState: BubbleState = CLOSED;
const bubbleSubs = new Set<() => void>();

function setBubble(next: BubbleState) {
  if (
    next.open === bubbleState.open &&
    next.left === bubbleState.left &&
    next.top === bubbleState.top &&
    next.view === bubbleState.view
  ) {
    return;
  }
  bubbleState = next;
  bubbleSubs.forEach((fn) => fn());
}

export function subscribeBubble(cb: () => void): () => void {
  bubbleSubs.add(cb);
  return () => bubbleSubs.delete(cb);
}
export function getBubbleState(): BubbleState {
  return bubbleState;
}
export const getBubbleServerSnapshot = (): BubbleState => CLOSED;

const bubbleSlot = $prose(
  () =>
    new Plugin({
      view: () => ({
        update: (v) => {
          const { from, to, empty } = v.state.selection;
          if (empty || bubbleMenuItems.length === 0 || !v.editable) {
            setBubble(CLOSED);
            return;
          }
          const start = v.coordsAtPos(from);
          const end = v.coordsAtPos(to);
          setBubble({
            open: true,
            left: (start.left + end.left) / 2,
            top: start.top,
            view: v,
          });
        },
        destroy: () => setBubble(CLOSED),
      }),
    }),
);

/* ── ① 플러그인 슬롯 ──────────────────────────────────────────
 * 기본 프리셋 + 메모 placeholder + 슬롯 플러그인(paste/bubble). 워커는 자기
 * 플러그인을 아래 배열에 한 줄 추가한다. presets(commonmark/gfm)는 배열이라
 * .flat()으로 평탄화해 .use(editorPlugins) 한 번에 넘긴다. */
export const editorPlugins: MilkdownPlugin[] = [
  commonmark,
  gfm,
  listener,
  markdownPlaceholder,
  pasteSlot,
  bubbleSlot,
  // (W5) ...wikilink,
  // (W10) autolink,
].flat();
