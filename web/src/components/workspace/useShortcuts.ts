"use client";

import { useEffect } from "react";
import { CAPTURE_TOOLS, useWorkspace } from "@/state/workspace";

/**
 * 글로벌 단축키 — FEAT-capture AC-1.
 *
 * - Cmd/Ctrl + Shift + N : 마지막 사용한 도구로 화면 중앙에 카드 생성
 * - Cmd/Ctrl + 1 ~ 0     : 인덱스(1..0 → 0..9) capture 도구로 화면 중앙에 카드 생성
 *
 * 텍스트 입력 중에는 발동하지 않는다 (예외: Cmd+Shift+N은 작성 흐름을 끊지 않게 항상 작동).
 * Cmd+1~0은 입력 중에 비활성 — 사용자가 숫자 입력하는 동안 카드가 튀어나오면 안 됨.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el?.matches("input, textarea, [contenteditable='true']");
    };

    const onDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const store = useWorkspace.getState();

      // Cmd+Shift+N — 마지막 도구
      if (e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        store.addCardAtViewportCenter(store.lastToolId);
        return;
      }

      // Cmd+1 ~ Cmd+0  (단축키 index: '1'=0 ... '9'=8, '0'=9)
      if (!e.shiftKey && !e.altKey && /^[0-9]$/.test(e.key)) {
        if (isTyping()) return;
        const idx = e.key === "0" ? 9 : Number(e.key) - 1;
        if (idx < 0 || idx >= CAPTURE_TOOLS.length) return;
        const tool = CAPTURE_TOOLS[idx];
        e.preventDefault();
        store.addCardAtViewportCenter(tool);
      }
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);
}
