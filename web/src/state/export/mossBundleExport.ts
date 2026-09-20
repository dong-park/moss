import JSZip from "jszip";
import { CURRENT_SCHEMA_VERSION } from "./legacyKinds";
import { collectExportData } from "./collectExportData";
import { attachmentZipPath, collectAttachments } from "./attachments";
import type {
  ExportProgress,
  ExportScope,
  MossBundleManifest,
  MossBundlePayload,
} from "./types";

function embeddingToJson(entry: MossBundlePayload["embeddings"][number]) {
  return {
    noteId: entry.noteId,
    contentHash: entry.contentHash,
    vector: Array.from(entry.vector),
    updatedAt: entry.updatedAt,
  };
}

function buildManifest(
  payload: Omit<MossBundlePayload, "manifest">,
  scope: ExportScope,
  scopeMeta?: MossBundleManifest["scopeMeta"],
  missingAttachments?: string[],
): MossBundleManifest {
  const frames = payload.notes.filter((n) => n.kind === "frame").length;
  return {
    version: "1.1",
    exportedAt: Date.now(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    counts: {
      notes: payload.notes.length,
      frames,
      boards: payload.boards.length,
      connections: payload.connections.length,
      embeddings: payload.embeddings.length,
    },
    scope,
    scopeMeta,
    ...(missingAttachments && missingAttachments.length > 0
      ? { missingAttachments }
      : {}),
  };
}

/** MossBundlePayload → zip Blob (메모리). */
export async function serializeMossBundle(
  payload: MossBundlePayload,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(payload.manifest, null, 2));
  zip.file("notes.json", JSON.stringify(payload.notes));
  zip.file("boards.json", JSON.stringify(payload.boards));
  zip.file("connections.json", JSON.stringify(payload.connections));
  zip.file(
    "embeddings.json",
    JSON.stringify(payload.embeddings.map(embeddingToJson)),
  );
  zip.file("settings.json", JSON.stringify(payload.settings));

  const attachmentEntries = [...payload.attachments.entries()];
  for (let i = 0; i < attachmentEntries.length; i++) {
    const [ref, blob] = attachmentEntries[i]!;
    onProgress?.({ phase: "zip", current: i + 1, total: attachmentEntries.length });
    zip.file(attachmentZipPath(ref), blob);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export interface MossExportOpts {
  scope: ExportScope;
  boardId?: string;
  noteIds?: string[];
  onProgress?: (p: ExportProgress) => void;
}

/** DB → .moss zip Blob. notes 0개면 null. */
export async function exportMossBundle(
  opts: MossExportOpts,
): Promise<{ blob: Blob; manifest: MossBundleManifest } | null> {
  opts.onProgress?.({ phase: "collect", current: 0, total: 1 });
  const data = await collectExportData(opts);
  if (data.notes.length === 0) return null;

  const { attachments, missingAttachments } = await collectAttachments(
    data.notes,
    opts.onProgress,
  );

  const scopeMeta =
    opts.scope === "board" && opts.boardId
      ? { boardId: opts.boardId }
      : opts.scope === "selection" && opts.noteIds
        ? { noteIds: opts.noteIds }
        : undefined;

  const manifest = buildManifest(
    { ...data, attachments },
    opts.scope,
    scopeMeta,
    missingAttachments,
  );

  const payload: MossBundlePayload = { manifest, ...data, attachments };
  const blob = await serializeMossBundle(payload, opts.onProgress);
  return { blob, manifest };
}

/** 테스트·round-trip용 — payload에서 zip 생성. */
export async function mossPayloadToZip(payload: MossBundlePayload): Promise<Blob> {
  return serializeMossBundle(payload);
}
