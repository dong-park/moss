"use client";

import { useT } from "@/i18n/Provider";
import { useExportStore } from "@/state/exportStore";

/** 보드피커 하단·Dock 근처 — 내보내기·가져오기 진입. */
export function DataTransferMenu({ className = "" }: { className?: string }) {
  const t = useT();
  const openExport = useExportStore((s) => s.openExportModal);
  const openImport = useExportStore((s) => s.openImportDialog);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        className="cursor-pointer rounded-md px-3 py-1.5 text-left text-sm text-text-muted transition-colors hover:bg-panel hover:text-text"
        onClick={() => openExport()}
      >
        {t("export.menu.export")}
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md px-3 py-1.5 text-left text-sm text-text-muted transition-colors hover:bg-panel hover:text-text"
        onClick={() => openImport()}
      >
        {t("import.menu.import")}
      </button>
    </div>
  );
}
