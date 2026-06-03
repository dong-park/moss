/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-learnability — 빈 메모 마크다운 치트시트 placeholder.
 *
 * 사이드바 블록 버튼이 사라진([[FEAT-markdown-memo-pen]]) 빈 메모에서, 무엇을
 * 칠 수 있는지(마크다운 문법)를 한 줄 치트시트로 알려준다. ProseMirror
 * 데코레이션으로 "빈 첫 문단"에 data-placeholder를 달고, globals.css의
 * `.moss-md-placeholder::before`가 저채도 힌트를 그린다. 한 글자라도 입력하면
 * doc이 더 이상 비어있지 않아 데코레이션이 사라진다(표준 placeholder 동작).
 *
 * 비파괴(AC-2): 내용이 있으면 isEmpty=false → 데코레이션 없음. 정적 텍스트라
 * 비용 0. 마크다운 문자열은 [[i18n]] `workspace.memo.placeholder.hint` 키.
 * ───────────────────────────────────────────────────────────── */

import type { EditorState } from "@milkdown/prose/state";
import { Plugin } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

import { t } from "@/i18n";

export const PLACEHOLDER_CLASS = "moss-md-placeholder";

/**
 * 빈 doc(단일 빈 textblock)일 때만 placeholder 데코레이션을 만든다.
 * 그 외에는 null — 데코레이션 없음(비파괴).
 */
export function placeholderDecorations(
  state: EditorState,
  text: string,
): DecorationSet | null {
  const { doc } = state;
  const first = doc.firstChild;
  const isEmpty =
    doc.childCount === 1 && !!first && first.isTextblock && first.content.size === 0;
  if (!first || !isEmpty) return null;
  return DecorationSet.create(doc, [
    Decoration.node(0, first.nodeSize, {
      class: PLACEHOLDER_CLASS,
      "data-placeholder": text,
    }),
  ]);
}

export const markdownPlaceholder = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          return placeholderDecorations(state, t("workspace.memo.placeholder.hint"));
        },
      },
    }),
);
