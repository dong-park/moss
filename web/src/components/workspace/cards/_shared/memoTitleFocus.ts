/* FEAT-memo-title AC-7 — 창 제목 줄 ↔ 본문 키보드 포커스 이동. */

import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";

const DIALOG = '[role="dialog"]';

/** 창 제목 입력 — data 속성으로 locale과 무관하게 잡는다. */
function dialogTitleInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    `${DIALOG} [data-memo-title-input]`,
  );
}

/** 본문 맨 앞 ArrowUp → 제목 줄 끝. */
export function focusMemoTitleEnd(): void {
  const input = dialogTitleInput();
  if (!input) return;
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

/** 펼치기 모달 본문에서만 — 문서 맨 위 ArrowUp을 제목 줄로 넘긴다. */
export const memoTitleArrowUpPlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.key !== "ArrowUp") return false;
          if (!view.endOfTextblock("backward")) return false;
          focusMemoTitleEnd();
          return true;
        },
      },
    }),
);
