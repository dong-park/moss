/* FEAT-memo-title-front-edit f4 — 본문 맨 앞 ArrowUp을 제목 줄로 넘기는 키맵.
 *
 * 앞면·창 공통. 에디터 뷰에서 [data-card-id] 조상으로 같은 카드의 제목 입력을
 * 찾으므로 메모가 여럿인 앞면에서도 전역 탐색 없이 동작한다(§6). 커서가 문서
 * 맨 앞일 때만 키를 소비하고, 아니면 기본 이동에 넘긴다(AC-5). */

import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { focusMemoTitleEnd } from "../memoTitleFocus";

export function titleArrowUpKeydown(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== "ArrowUp") return false;
  if (!view.editable) return false;
  if (!view.endOfTextblock("backward")) return false;
  focusMemoTitleEnd(view);
  return true;
}

export const memoTitleArrowUpPlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown: titleArrowUpKeydown,
      },
    }),
);
