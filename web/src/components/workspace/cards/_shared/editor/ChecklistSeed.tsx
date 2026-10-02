"use client";

import { useEffect } from "react";
import { editorViewCtx } from "@milkdown/core";
import { TextSelection } from "@milkdown/prose/state";
import { useInstance } from "@milkdown/react";
import { FORMAT_COMMANDS } from "./formatCommands";

/**
 * 도크 "할 일" 버튼 (spec/dock-link-todo-photo.md) — 새 메모 창이 열리면 본문 첫 줄을
 * 체크박스로 만들고 커서를 그 안에 둔다. 마크다운 `- [ ] `는 내용이 없으면 gfm이
 * 체크박스로 읽지 않아서, 편집기의 ☑ 명령을 직접 실행한다.
 */
let pending: string | null = null;

export function requestChecklistSeed(cardId: string): void {
  pending = cardId;
}

export function ChecklistSeed({ cardId }: { cardId: string }) {
  const [loading, getEditor] = useInstance();
  useEffect(() => {
    if (loading || pending !== cardId) return;
    pending = null;
    getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
      FORMAT_COMMANDS.checklist.run(view);
    });
  }, [loading, getEditor, cardId]);
  return null;
}
