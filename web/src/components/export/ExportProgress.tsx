"use client";

import { useT } from "@/i18n/Provider";

/** SCR-export in-progress — 진행 막대 + phase/count. */
export function ExportProgress({
  phase,
  current,
  total,
}: {
  phase: string;
  current: number;
  total: number;
}) {
  const t = useT();
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const phaseLabel =
    phase === "attachments"
      ? t("export.progress.attachments")
      : phase === "zip"
        ? t("export.progress.zip")
        : t("export.progress.collect");

  return (
    <div className="mt-4 space-y-2" data-export-progress>
      <div className="flex justify-between text-xs text-text-muted">
        <span>{phaseLabel}</span>
        <span>
          {current}/{total || "—"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel">
        <div
          className="h-full rounded-full bg-accent-lime transition-[width] duration-200"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
