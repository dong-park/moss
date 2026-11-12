"use client";

import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { useCompactControls } from "../useCompactControls";

export function SystemBoardEmpty() {
  const t = useT();
  const compact = useCompactControls();
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
          {t("reviewCanvas.emptyTitle")}
        </p>
        <p className="mt-2 text-sm text-text-muted">
          {t("reviewCanvas.emptyBody")}
        </p>
        <button type="button" className="mt-4 min-h-12 rounded-lg bg-text px-4 text-sm text-bg focus-visible:outline-2 focus-visible:outline-accent-blue"
          onClick={() => {
            const id = useWorkspace.getState().addCardAtViewportCenter("text");
            if (compact) useWorkspace.getState().setExpandedCard(id, "edit");
          }}>
          {t("reviewCanvas.firstMemo")}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-text-muted">{t("reviewCanvas.typesHint")}</p>
      </div>
    </div>
  );
}
