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
      const store = useWorkspace.getState();

      // FEAT-text-tool AC-2: T = 텍스트 배치 모드(1회성). 입력·편집·펜 모드 중엔 무시.
      // useCardFlowShortcuts의 "글자 키 → 제목 편집"보다 먼저 잡아 stopImmediatePropagation으로
      // T가 제목 편집으로 새지 않게 한다(이 hook이 ShortcutsBinder에서 먼저 등록된다).
      if (!mod && !e.altKey && !e.shiftKey && (e.key === "t" || e.key === "T")) {
        if (isTyping() || store.editingId || store.penMode) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        store.armTextPlacement();
        return;
      }
      // 배치 모드 취소 — 캔버스의 Esc(선택 해제·상위 이동)보다 먼저 소비한다.
      if (e.key === "Escape" && store.textPlacementArmed) {
        if (isTyping()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        store.disarmTextPlacement();
        return;
      }

      if (!mod) return;

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
