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
import { wikilink } from "./wikilink";
import { autolink } from "./autolink";
import { sanitizePasteHandler } from "./sanitizePaste";
import { imagePasteHandler, opfsImagePlugin } from "./imagePaste";
import { memoBlockDecorations } from "./blockView"; // (FEAT-sticky-redesign n4) 링크·녹음·파일 블록
import { memoBubbleItems } from "./BubbleToolbar"; // (W3) 인카드 버블 서식 항목
import { memoTitleArrowUpPlugin } from "./titleArrowUp"; // (f4) 맨 앞 ArrowUp → 제목 줄
import { taskTogglePlugin } from "./taskToggle"; // 체크리스트 상자 클릭 토글

/* ── ② paste 슬롯 ──────────────────────────────────────────────
 * true 반환 시 기본 동작 차단(소비). 등록 순서대로 시도, 첫 true에서 중단.
 * W6(sanitize)가 먼저, W2(image)가 나중 — 텍스트 정제 후 이미지 추출. */
export type PasteHandler = (
  view: EditorView,
  event: ClipboardEvent | DragEvent,
) => boolean;

export const pasteHandlers: PasteHandler[] = [
  sanitizePasteHandler, // (W6) sanitize 먼저 — 텍스트 정제
  imagePasteHandler, // (W2) 그 다음 이미지 추출(순서 계약)
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
  ...memoBubbleItems, // (W3)
];

export type BubbleState = {
  open: boolean;
  left: number;
  /** 버블은 늘 이 y 위에 뜬다(BubbleMenuHost가 -translate-y-full, top − 6). */
  top: number;
  /** 버블 전체가 들어가야 할 가로 범위(스크롤 영역). 없으면 화면만 본다. */
  minLeft: number;
  maxLeft: number;
  view: EditorView | null;
};

const CLOSED: BubbleState = {
  open: false,
  left: 0,
  top: 0,
  minLeft: -Infinity,
  maxLeft: Infinity,
  view: null,
};
// 버블 높이(약 34px) + 간격 6px. 기준 y 위로 버블이 차지하는 높이다.
const BUBBLE_ROOM = 40;
let bubbleState: BubbleState = CLOSED;
const bubbleSubs = new Set<() => void>();

function setBubble(next: BubbleState) {
  if (
    next.open === bubbleState.open &&
    next.left === bubbleState.left &&
    next.top === bubbleState.top &&
    next.minLeft === bubbleState.minLeft &&
    next.maxLeft === bubbleState.maxLeft &&
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

// bubbleSlot이 마지막으로 본 view. 스크롤로 좌표를 다시 계산할 때 쓴다.
let lastView: EditorView | null = null;
// 펼친 창의 스크롤 영역. 선택이 바뀔 때도 스크롤할 때도 이 영역의 보이는 범위로 버블을 놓는다.
let bubbleScrollEl: HTMLElement | null = null;

/** ExpandedMarkdownEditor가 스크롤 영역을 ref로 등록한다(떼어질 때 null). */
export function setBubbleScrollEl(el: HTMLElement | null): void {
  bubbleScrollEl = el;
}

/** 선택과 보이는 범위로 버블 상태를 정한다. 선택이 바뀔 때(plugin update)와 스크롤할 때
 * (refreshBubble)가 같은 판정을 쓴다 — 같은 선택·같은 스크롤이면 경로와 상관없이 같은 결과.
 * - 선택의 어느 부분도 안 보이면 닫는다. 세로는 위·아래로 통째로 나갔을 때, 가로는 한 줄
 *   선택이 좌우로 통째로 나갔을 때다. 여러 줄 선택은 가운데 줄이 늘 컬럼 왼쪽부터 차므로
 *   양 끝이 밖이어도 보인다 — 가로로는 닫지 않는다.
 * - 버블은 늘 위에 뜨고, 제목 입력과 선택 아래 글자를 덮지 않는다. 덮인 자리를 누르면 클릭이
 *   버블 버튼에 닿아 본문 서식이 바뀌기 때문이다(아래로 뒤집으면 2·3번째 줄의 끌어 늘리기와
 *   Shift+클릭이, 제목 위로 띄우면 제목 클릭이 막혔다).
 *   기준 y는 선택 중 보이는 부분의 맨 위(max(선택 시작, 스크롤 영역 위 끝))다. 시작이 위로
 *   나가 있으면 스크롤 영역 위 끝이라, 버블 버튼이 낸 scrollIntoView로 시작이 밀려 올라가도
 *   닫히지 않는다. 그 자리의 버블이 제목 입력에 걸리면 제목 위로 올린다. 그래서 종이 위 끝
 *   근처에서는 버블이 종이 padding과 종이 밖 어두운 막 위에 걸칠 수 있다. 종이 높이 상한
 *   (100vh − 88px)으로 종이 위가 44px 이상 비어 화면 밖으로는 나가지 않는다.
 * - 가로 범위로 스크롤 영역 좌우를 넘긴다. BubbleMenuHost가 버블 폭을 재서 그 안(화면 좌우
 *   8px 안)으로 당긴다.
 * - 끝 좌표는 side −1로 읽는다. 줄 끝까지 고르면 끝이 줄바꿈 지점에 놓이는데, 기본 side로는
 *   다음 줄 머리 좌표가 나와 한 줄 선택이 두 줄로 판정되고 가로 중심도 틀어진다. */
function computeBubble(v: EditorView, scrollEl: HTMLElement | null): BubbleState {
  const { from, to, empty } = v.state.selection;
  if (empty || bubbleMenuItems.length === 0 || !v.editable) return CLOSED;
  const start = v.coordsAtPos(from);
  const end = v.coordsAtPos(to, -1);
  const left = (start.left + end.left) / 2;
  let top = start.top;
  let minLeft = -Infinity;
  let maxLeft = Infinity;
  if (scrollEl) {
    const r = scrollEl.getBoundingClientRect();
    if (end.bottom < r.top || start.top > r.bottom) return CLOSED;
    const oneLine = Math.abs(end.top - start.top) < 1;
    if (oneLine && (Math.max(start.left, end.left) < r.left || Math.min(start.left, end.left) > r.right)) {
      return CLOSED;
    }
    top = Math.max(start.top, r.top);
    const title =
      typeof scrollEl.querySelector === "function"
        ? scrollEl.querySelector<HTMLElement>("[data-memo-title-input]")
        : null;
    if (title) {
      const t = title.getBoundingClientRect();
      // 제목이 보이고 버블([top − 40, top − 6])이 제목에 걸리면 보이는 제목 위로 올린다.
      if (t.bottom > r.top && top - BUBBLE_ROOM < t.bottom) top = Math.max(t.top, r.top);
    }
    minLeft = r.left;
    maxLeft = r.right;
  }
  return { open: true, left, top, minLeft, maxLeft, view: v };
}

/** 스크롤 영역이 스크롤될 때 부른다. 현재 선택으로 좌표를 다시 계산해 버블이 글자를
 * 따라가게 한다. 판정은 computeBubble 하나다. 스크롤마다 닫지 않는다. */
export function refreshBubble(
  scrollEl: HTMLElement,
  view: EditorView | null = lastView,
): void {
  if (!view) return;
  setBubble(computeBubble(view, scrollEl));
}

const bubbleSlot = $prose(
  () =>
    new Plugin({
      view: () => ({
        update: (v) => {
          lastView = v;
          setBubble(computeBubble(v, bubbleScrollEl));
        },
        destroy: () => {
          lastView = null;
          setBubble(CLOSED);
        },
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
  opfsImagePlugin, // (W2) opfs:// 이미지 → blob URL NodeView (resolver)
  memoBlockDecorations, // (n4) 링크·녹음·파일 블록 — 원문 숨김 + 위젯 데코레이션
  ...wikilink, // (W5) [[위키링크]] — 데코레이션 + 자동완성
  ...autolink, // (W10) URL 자동 링크화
  memoTitleArrowUpPlugin, // (f4) 본문 맨 앞 ArrowUp → 제목 줄 (앞면·창 공통)
  taskTogglePlugin, // 체크리스트 항목 왼쪽 상자 클릭 → 체크 토글
].flat();
