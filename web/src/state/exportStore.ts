"use client";

import { create } from "zustand";
import { collectExportData } from "./export/collectExportData";
import { exportMarkdownZip } from "./export/markdownExport";
import { exportJsonCanvasZip } from "./export/jsonCanvasExport";
import { exportMossBundle } from "./export/mossBundleExport";
import {
  importMossBundle,
  type ImportRejectedError,
} from "./export/mossBundleImport";
import type {
  ExportFormat,
  ExportOptions,
  ExportScope,
  ImportReport,
} from "./export/types";

export class ExportEmptyError extends Error {
  constructor() {
    super("empty_export");
    this.name = "ExportEmptyError";
  }
}

interface ExportState {
  exporting: boolean;
  importing: boolean;
  progress: { phase: string; current: number; total: number } | null;

  runExport: (opts: ExportOptions) => Promise<Blob>;
  downloadBlob: (blob: Blob, filename: string) => void;
  importMossBundle: (
    file: File,
    mode: "merge" | "overwrite",
  ) => Promise<ImportReport>;
}

function exportFilename(format: ExportFormat, scope: ExportScope): string {
  const ts = new Date().toISOString().slice(0, 10);
  switch (format) {
    case "moss":
      return `moss-backup-${ts}.moss.zip`;
    case "markdown":
      return `moss-markdown-${ts}.zip`;
    case "jsonCanvas":
      return `moss-canvas-${ts}.zip`;
  }
}

export const useExportStore = create<ExportState>((set) => ({
  exporting: false,
  importing: false,
  progress: null,

  runExport: async (opts) => {
    set({ exporting: true, progress: null });
    try {
      const onProgress = (p: { phase: string; current: number; total: number }) => {
        set({ progress: p });
      };

      if (opts.format === "moss") {
        const result = await exportMossBundle({
          scope: opts.scope,
          boardId: opts.boardId,
          noteIds: opts.noteIds,
          onProgress,
        });
        if (!result) throw new ExportEmptyError();
        return result.blob;
      }

      const data = await collectExportData({
        scope: opts.scope,
        boardId: opts.boardId,
        noteIds: opts.noteIds,
      });
      if (data.notes.length === 0) throw new ExportEmptyError();

      onProgress({ phase: "zip", current: 0, total: 1 });

      if (opts.format === "markdown") {
        return exportMarkdownZip(data.notes, data.boards);
      }
      return exportJsonCanvasZip(data.notes, data.boards, data.connections);
    } finally {
      set({ exporting: false, progress: null });
    }
  },

  downloadBlob: (blob, filename) => {
    if (typeof document === "undefined") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  importMossBundle: async (file, mode) => {
    set({ importing: true });
    try {
      return await importMossBundle(file, mode);
    } finally {
      set({ importing: false });
    }
  },
}));

export type { ImportReport, ImportRejectedError };
export { exportFilename };
