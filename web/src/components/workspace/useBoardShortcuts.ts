"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";

/**
 * FEAT-boards AC-3 단축키.
 *
 * - Cmd/Ctrl + P : 보드 선택 드롭다운 열기 (트리거 버튼 클릭)
 * - Cmd/Ctrl + B : 시스템 보드 ↔ 마지막 사용자 보드 토글
 * - Cmd/Ctrl + N : 새 보드 만들기 — TemplatePicker 모달 오픈 (FEAT-templates)
 *
 * 텍스트 입력 중이어도 P/B/N 자체는 작동 (모두 modifier 동반이라 충돌 적음).
 * 단, Cmd+Shift+N은 FEAT-capture의 "마지막 도구로 카드 생성"이라 본 hook은
 * shiftKey가 눌려 있으면 무시한다.
 */
export function useBoardShortcuts(): void {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (key === "p") {
        e.preventDefault();
        const trigger = document.querySelector<HTMLButtonElement>(
          "[data-board-picker-trigger]",
        );
        trigger?.click();
        // 드롭다운 첫 항목 포커스는 Radix가 자동 처리(via auto-focus to first item)
        return;
      }

      if (key === "b") {
        e.preventDefault();
        void useWorkspace.getState().toggleSystemBoard();
        return;
      }

      if (key === "n") {
        e.preventDefault();
        useWorkspace.getState().setTemplatePickerOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);
}
