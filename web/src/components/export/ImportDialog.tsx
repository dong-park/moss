"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  ImportRejectedError,
  useExportStore,
} from "@/state/exportStore";
import { peekMossManifest } from "@/state/export/mossBundleImport";
import type { ImportReport } from "@/state/export/types";
import { useWorkspace } from "@/state/workspace";
import { CURRENT_SCHEMA_VERSION } from "@/state/export/legacyKinds";

function formatSkipped(report: ImportReport): string {
  return report.skippedLegacyKind
    .map((s) => `${s.kind}×${s.count}`)
    .join(", ");
}

/**
 * .moss 번들 가져오기 — 덮어쓰기/병합 확인 + ImportReport 요약.
 */
export function ImportDialog() {
  const t = useT();
  const open = useExportStore((s) => s.importDialogOpen);
  const close = useExportStore((s) => s.closeImportDialog);
  const importBundle = useExportStore((s) => s.importMossBundle);
  const importing = useExportStore((s) => s.importing);
  const loadFromStorage = useWorkspace((s) => s.loadFromStorage);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"merge" | "overwrite">("merge");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const reset = () => {
    setFile(null);
    setError(null);
    setReport(null);
    setConfirmOverwrite(false);
    setMode("merge");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    close();
  };

  const handleFileChange = async (f: File | null) => {
    setFile(f);
    setError(null);
    setReport(null);
    if (!f) return;
    const peek = await peekMossManifest(f);
    if (!peek.ok) {
      if (peek.reason === "schema_too_old") {
        setError(
          t("import.error.schemaOld", {
            bundle: String(CURRENT_SCHEMA_VERSION - 1),
            current: String(CURRENT_SCHEMA_VERSION),
          }),
        );
      } else if (peek.reason === "empty_file" || peek.reason === "not_zip") {
        setError(t("import.error.invalidFile"));
      } else if (peek.reason === "manifest_missing") {
        setError(t("import.error.noManifest"));
      } else {
        setError(t("import.error.rejected"));
      }
      setFile(null);
    }
  };

  const runImport = async () => {
    if (!file) return;
    if (mode === "overwrite" && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    setError(null);
    try {
      const result = await importBundle(file, mode);
      setReport(result);
      await loadFromStorage();
    } catch (err) {
      if (err instanceof ImportRejectedError) {
        setError(t("import.error.rejected"));
      } else {
        setError(t("import.error.generic"));
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-5 shadow-card-lift focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="text-base font-semibold text-text">
            {t("import.dialog.title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-muted">
            {t("import.dialog.subtitle")}
          </Dialog.Description>

          {!report ? (
            <div className="mt-4 space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept=".zip,.moss"
                className="block w-full text-sm text-text"
                onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
              />

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-text">
                  {t("import.mode.label")}
                </legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === "merge"}
                    onChange={() => {
                      setMode("merge");
                      setConfirmOverwrite(false);
                    }}
                  />
                  {t("import.mode.merge")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === "overwrite"}
                    onChange={() => setMode("overwrite")}
                  />
                  {t("import.mode.overwrite")}
                </label>
              </fieldset>

              {confirmOverwrite && mode === "overwrite" && (
                <p className="text-sm text-amber-700">{t("import.overwriteWarning")}</p>
              )}

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-text" data-import-report>
              <p>{t("import.report.imported", { count: report.imported.notes })}</p>
              {report.skippedLegacyKind.length > 0 && (
                <p>
                  {t("import.report.skippedLegacy", {
                    count: report.skippedLegacyKind.reduce((a, s) => a + s.count, 0),
                    detail: formatSkipped(report),
                  })}
                </p>
              )}
              {report.skippedDuplicateId > 0 && (
                <p>{t("import.report.skippedDuplicate", { count: report.skippedDuplicateId })}</p>
              )}
              {report.missingAttachments > 0 && (
                <p>{t("import.report.missingAttachments", { count: report.missingAttachments })}</p>
              )}
              {report.unlinkedFrameRefs > 0 && (
                <p>{t("import.report.unlinkedFrames", { count: report.unlinkedFrameRefs })}</p>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-panel"
            >
              {report ? t("import.dialog.done") : t("import.dialog.cancel")}
            </button>
            {!report && (
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={!file || importing || !!error}
                className="cursor-pointer rounded-md bg-accent-lime px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                data-import-submit
              >
                {importing ? t("import.dialog.importing") : t("import.dialog.submit")}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
