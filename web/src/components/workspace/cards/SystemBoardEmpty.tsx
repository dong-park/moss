"use client";

import { useT } from "@/i18n/Provider";

export function SystemBoardEmpty() {
  const t = useT();
  return (
    <div
      data-testid="system-board-empty"
      className="pointer-events-none absolute inset-0 z-[var(--z-panel)] flex items-center justify-center"
    >
      <div
        className="pointer-events-auto max-w-md rounded-lg border border-border/60 bg-card-base p-6 text-center shadow-card"
        style={{ background: "var(--gradient-paper)" }}
      >
        <p className="text-base font-medium text-text">
          {t("workspace.system.empty.title")}
        </p>
        <p className="mt-2 text-sm text-text-muted">
          {t("workspace.system.empty.body")}
        </p>
      </div>
    </div>
  );
}
