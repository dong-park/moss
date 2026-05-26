"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";

/**
 * FEAT-card-flow §6: 카드 간 키보드 흐름 단축키.
 *
 * - Cmd/Ctrl + Enter : 편집 종료 + 같은 종류 다음 카드 (편집 중 카드 한정,
 *   타이핑 중이어도 발동 — Enter 단독은 줄바꿈으로 보존).
 * - Cmd/Ctrl + E    : 선택 카드 편집 진입 (입력 중엔 비활성).
 * - Tab / Shift+Tab : 캔버스에서 카드 사이 선택 이동 (입력 중엔 브라우저 기본
 *   Tab 흐름 보존).
 *
 * `useShortcuts`(Cmd+1~0)와 `useBoardShortcuts`(Cmd+P/B/N)는 modifier+다른 키라
 * 처리 키셋이 겹치지 않는다 — 별 hook으로 분리해 책임을 가른다.
 */
export function useCardFlowShortcuts(): void {
  useEffect(() => {
    const isTyping = (el: Element | null): boolean =>
      !!el && (el as HTMLElement).matches?.("input, textarea, [contenteditable='true']");

    const onDown = (e: KeyboardEvent) => {
      const store = useWorkspace.getState();
      const target = e.target as Element | null;
      const typing = isTyping(target);
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+Enter — 편집 중 카드에서 동작, 입력 중에도 발동 (next-card 진행).
      if (mod && e.key === "Enter" && store.editingId) {
        e.preventDefault();
        store.commitAndAddNext(store.editingId);
        return;
      }

      // Cmd+E — 입력 중엔 비활성, Shift 동반 시 무시.
      if (mod && (e.key === "e" || e.key === "E") && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        store.enterEditOnSelected();
        return;
      }

      // Tab / Shift+Tab — 입력 중엔 기본 Tab 흐름 보존, modifier 동반 시 무시.
      if (e.key === "Tab" && !mod) {
        if (typing) return;
        if (store.selectedIds.length !== 1) return;
        e.preventDefault();
        store.focusNextCard(e.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);
}
