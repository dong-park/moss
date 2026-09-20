"use client";

import { useShortcuts } from "./useShortcuts";
import { useBoardShortcuts } from "./useBoardShortcuts";
import { useCardFlowShortcuts } from "./useCardFlowShortcuts";
import { useExportShortcuts } from "@/components/export/useExportShortcuts";

/**
 * 글로벌 키보드 리스너를 마운트하는 빈 컴포넌트.
 * Page (server component) → 본 client 컴포넌트로 hook 사용.
 */
export function ShortcutsBinder() {
  useShortcuts();
  useBoardShortcuts();
  useCardFlowShortcuts();
  useExportShortcuts();
  return null;
}
