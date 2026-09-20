"use client";

import { useEffect } from "react";
import { useExportStore } from "@/state/exportStore";

/** Cmd+Shift+E — 내보내기 모달 (Cmd+E는 편집 진입). */
export function useExportShortcuts(): void {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key !== "e" && e.key !== "E") return;

      const target = e.target as Element | null;
      if (
        target &&
        (target as HTMLElement).matches?.("input, textarea, [contenteditable='true']")
      ) {
        return;
      }

      e.preventDefault();
      useExportStore.getState().openExportModal();
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);
}
