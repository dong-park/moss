import type { Board, Connection, EmbeddingCacheEntry, Note, Settings } from "../db/schema";

export type ExportScope = "all" | "board" | "selection";
export type ExportFormat = "moss" | "markdown" | "jsonCanvas";

export interface MossBundleManifest {
  version: "1.1";
  exportedAt: number;
  schemaVersion: number;
  counts: {
    notes: number;
    frames: number;
    boards: number;
    connections: number;
    embeddings: number;
  };
  scope: ExportScope;
  scopeMeta?: { boardId?: string; noteIds?: string[] };
  missingAttachments?: string[];
}

export interface ImportReport {
  imported: {
    notes: number;
    frames: number;
    boards: number;
    connections: number;
  };
  skippedLegacyKind: { kind: string; count: number }[];
  skippedDuplicateId: number;
  missingAttachments: number;
  unlinkedFrameRefs: number;
}

export type ExportProgressPhase = "collect" | "attachments" | "zip";

export interface ExportProgress {
  phase: ExportProgressPhase;
  current: number;
  total: number;
}

export interface ExportOptions {
  scope: ExportScope;
  format: ExportFormat;
  boardId?: string;
  noteIds?: string[];
  onProgress?: (p: ExportProgress) => void;
}

export interface MossBundlePayload {
  manifest: MossBundleManifest;
  notes: Note[];
  boards: Board[];
  connections: Connection[];
  embeddings: EmbeddingCacheEntry[];
  settings: Settings;
  attachments: Map<string, Blob>;
}

export type ValidateManifestResult =
  | { ok: true; manifest: MossBundleManifest }
  | { ok: false; reason: ManifestRejectReason };

export type ManifestRejectReason =
  | "manifest_not_found"
  | "invalid_version"
  | "invalid_schema_version"
  | "schema_too_old"
  | "schema_too_new"
  | "invalid_structure";
