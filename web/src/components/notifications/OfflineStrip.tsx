"use client";

import { useOnlineStatus } from "@/state/network";
import { useT } from "@/i18n/Provider";

/**
 * spec §7 — 오프라인일 때만 상단 1px 띠 + 보이지 않게 인사이드 라벨.
 */
export function OfflineStrip() {
  const online = useOnlineStatus();
  const t = useT();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[var(--z-toast)] flex items-center justify-center"
      style={{ height: "1px", background: "var(--color-accent-blue)" }}
    >
      <span className="sr-only">{t("storage.offline.label")}</span>
    </div>
  );
}
