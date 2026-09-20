/* FEAT-memo-title AC-7 — 제목 줄 ↔ 본문 키보드 포커스 이동.
 * FEAT-memo-title-front-edit f2·f4 — 카드 스코프 blur 가드·본문 포커스 레지스트리. */

import type { EditorView } from "@milkdown/prose/view";

const DIALOG = '[role="dialog"]';

/** 같은 카드 안의 제목 입력을 카드 스코프로 잡는다(앞면 메모 여럿 대응, §6). */
function titleInputFor(view?: EditorView): HTMLInputElement | null {
  if (view) {
    const card = view.dom?.closest?.("[data-card-id]");
    if (card) {
      const input = card.querySelector<HTMLInputElement>(
        "[data-memo-title-input]",
      );
      if (input) return input;
    }
  }
  // 창은 카드가 하나뿐 — data-card-id 조상이 없으면 dialog로 폴백.
  return document.querySelector<HTMLInputElement>(
    `${DIALOG} [data-memo-title-input]`,
  );
}

/** 본문 맨 앞 ArrowUp → 같은 카드(또는 창)의 제목 줄 끝. */
export function focusMemoTitleEnd(view?: EditorView): void {
  const input = titleInputFor(view);
  if (!input) return;
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

/* ── 본문 포커스 레지스트리 (f4) ──────────────────────────────
 * 앞면 제목 줄은 본문 에디터(MilkdownProvider) 바깥에 있어 useInstance를 못 쓴다.
 * MarkdownEditor가 카드 id로 자기 본문 포커스 함수를 등록하고, 제목 줄 Enter가
 * 그 id로 찾아 부른다 — 전역 탐색 없이 카드 스코프. */
const bodyFocusers = new Map<string, () => void>();

export function registerMemoBodyFocus(
  cardId: string,
  focus: (() => void) | null,
): void {
  if (focus) bodyFocusers.set(cardId, focus);
  else bodyFocusers.delete(cardId);
}

/** 제목 줄 Enter/ArrowDown → 같은 카드 본문 맨 앞. 등록이 없으면 false. */
export function focusMemoBodyStart(cardId: string): boolean {
  const focus = bodyFocusers.get(cardId);
  if (!focus) return false;
  focus();
  return true;
}

/* ── blur 가드 (f2) ──────────────────────────────────────────
 * 본문·제목이 blur될 때 새 포커스 대상이 같은 카드의 [data-card-id] 안이면
 * 편집을 끝내지 않는다(AC-3). 판정은 카드 루트 기준 조상 탐색 한 번(§6). */
export function isFocusInSameCard(
  target: EventTarget | null,
  cardId: string,
): boolean {
  if (!target || typeof (target as Node).nodeType !== "number") return false;
  const node = target as Node;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return !!el?.closest(`[data-card-id="${cardId}"]`);
}
