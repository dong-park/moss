"use client";

/* FEAT-memo-title AC-7 — MilkdownProvider 안에서 제목 줄 ↔ 본문 포커스 이동. */

import { useCallback } from "react";
import { editorViewCtx } from "@milkdown/core";
import { TextSelection } from "@milkdown/prose/state";
import { useInstance } from "@milkdown/react";
import { MemoTitleRow } from "./MemoTitleRow";

export function MemoExpandTitleSlot({
  title,
  onCommit,
  editable = true,
  autoFocus = false,
}: {
  title: string;
  editable?: boolean;
  autoFocus?: boolean;
  onCommit: (title: string) => void;
}) {
  const [, getEditor] = useInstance();

  const focusBodyStart = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = view.state.tr.setSelection(
        TextSelection.atStart(view.state.doc),
      );
      view.dispatch(tr);
      view.focus();
    });
  }, [getEditor]);

  return (
    <MemoTitleRow
      editable={editable}
      autoFocus={autoFocus}
      title={title}
      onCommit={onCommit}
      onEnter={focusBodyStart}
      onArrowDown={focusBodyStart}
    />
  );
}
