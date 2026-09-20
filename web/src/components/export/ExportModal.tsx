"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  ExportEmptyError,
  exportFilename,
  useExportStore,
} from "@/state/exportStore";
import type { ExportFormat, ExportScope } from "@/state/export/types";
import { useToasts } from "@/state/notifications";
import { useWorkspace } from "@/state/workspace";
import { ExportProgress } from "./ExportProgress";

/**
 * SCR-export modal-default — 범위 + 포맷 선택 후 내보내기.
 */
export function ExportModal() {
  const t = useT();
  const open = useExportStore((s) => s.exportModalOpen);
  const defaults = useExportStore((s) => s.exportDefaults);
  const close = useExportStore((s) => s.closeExportModal);
  const runExport = useExportStore((s) => s.runExport);
  const downloadBlob = useExportStore((s) => s.downloadBlob);
  const exporting = useExportStore((s) => s.exporting);
  const progress = useExportStore((s) => s.progress);
  const pushToast = useToasts((s) => s.push);

  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const selectedIds = useWorkspace((s) => s.selectedIds);

  const [scope, setScope] = useState<ExportScope>("all");
  const [format, setFormat] = useState<ExportFormat>("moss");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setScope(defaults?.scope ?? "all");
    setFormat("moss");
  }, [open, defaults]);

  const handleExport = async () => {
    setError(null);
    try {
      const noteIds = scope === "selection" ? selectedIds : undefined;
      const boardId =
        scope === "board" ? (defaults?.boardId ?? currentBoardId ?? undefined) : undefined;

      const blob = await runExport({ scope, format, boardId, noteIds });
      const name = exportFilename(format, scope);
      downloadBlob(blob, name);
      pushToast({
        tone: "calm",
        title: t("export.success.title"),
        body: t("export.success.body", { filename: name }),
        duration: 3000,
      });
      close();
    } catch (err) {
      if (err instanceof ExportEmptyError) {
        setError(t("export.error.empty"));
      } else {
        setError(t("export.error.generic"));
      }
    }
  };

  const selectionDisabled = selectedIds.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-5 shadow-card-lift focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="text-base font-semibold text-text">
            {t("export.modal.title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-muted">
            {t("export.modal.subtitle")}
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text">
                {t("export.scope.label")}
              </legend>
              {(
                [
                  ["all", t("export.scope.all")],
                  ["board", t("export.scope.board")],
                  ["selection", t("export.scope.selection")],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-text"
                >
                  <input
                    type="radio"
                    name="export-scope"
                    value={value}
                    checked={scope === value}
                    disabled={value === "selection" && selectionDisabled}
                    onChange={() => setScope(value)}
                  />
                  {label}
                  {value === "selection" && selectionDisabled && (
                    <span className="text-xs text-text-soft">
                      ({t("export.scope.selectionEmpty")})
                    </span>
                  )}
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text">
                {t("export.format.label")}
              </legend>
              {(
                [
                  ["moss", t("export.format.moss")],
                  ["markdown", t("export.format.markdown")],
                  ["jsonCanvas", t("export.format.jsonCanvas")],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-text"
                >
                  <input
                    type="radio"
                    name="export-format"
                    value={value}
                    checked={format === value}
                    onChange={() => setFormat(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {exporting && progress && (
              <ExportProgress
                phase={progress.phase}
                current={progress.current}
                total={progress.total}
              />
            )}

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={exporting}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-panel disabled:opacity-50"
            >
              {t("export.modal.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || (scope === "selection" && selectionDisabled)}
              className="cursor-pointer rounded-md bg-accent-lime px-3 py-1.5 text-sm font-medium text-text transition-opacity hover:opacity-90 disabled:opacity-50"
              data-export-submit
            >
              {exporting ? t("export.modal.exporting") : t("export.modal.submit")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
