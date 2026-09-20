import JSZip from "jszip";
import {
  DEFAULT_SETTINGS,
  getDB,
  type Board,
  type Connection,
  type EmbeddingCacheEntry,
  type Note,
  type Settings,
} from "../db/schema";
import { putBlob } from "../db/opfs";
import { normalizeTitle } from "../memoTitle";
import { partitionImportNotes } from "./partitionImportNotes";
import { validateManifest } from "./validateManifest";
import type { ImportReport, MossBundleManifest } from "./types";

export type ImportRejectReason =
  | "empty_file"
  | "not_zip"
  | "manifest_missing"
  | "manifest_not_found"
  | "invalid_version"
  | "invalid_schema_version"
  | "schema_too_old"
  | "schema_too_new"
  | "invalid_structure";

export class ImportRejectedError extends Error {
  constructor(public readonly reason: ImportRejectReason) {
    super(reason);
    this.name = "ImportRejectedError";
  }
}

interface ParsedBundle {
  manifest: MossBundleManifest;
  notes: unknown[];
  boards: Board[];
  connections: Connection[];
  embeddings: EmbeddingCacheEntry[];
  settings: Settings;
  attachmentFiles: Map<string, Blob>;
}

function parseEmbedding(raw: {
  noteId: string;
  contentHash: string;
  vector: number[];
  updatedAt: number;
}): EmbeddingCacheEntry {
  return {
    noteId: raw.noteId,
    contentHash: raw.contentHash,
    vector: new Float32Array(raw.vector),
    updatedAt: raw.updatedAt,
  };
}

async function parseMossZip(file: Blob): Promise<ParsedBundle> {
  if (file.size === 0) throw new ImportRejectedError("empty_file");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ImportRejectedError("not_zip");
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new ImportRejectedError("manifest_missing");

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await manifestFile.async("string"));
  } catch {
    throw new ImportRejectedError("manifest_missing");
  }

  const validated = validateManifest(manifestRaw);
  if (!validated.ok) throw new ImportRejectedError(validated.reason);

  const readJson = async <T>(name: string, fallback: T): Promise<T> => {
    const f = zip.file(name);
    if (!f) return fallback;
    try {
      return JSON.parse(await f.async("string")) as T;
    } catch {
      return fallback;
    }
  };

  const notes = await readJson<unknown[]>("notes.json", []);
  const boards = await readJson<Board[]>("boards.json", []);
  const connections = await readJson<Connection[]>("connections.json", []);
  const embeddingsRaw = await readJson<
    { noteId: string; contentHash: string; vector: number[]; updatedAt: number }[]
  >("embeddings.json", []);
  const settings =
    (await readJson<Settings | null>("settings.json", null)) ?? {
      ...DEFAULT_SETTINGS,
    };

  const embeddings = embeddingsRaw.map(parseEmbedding);

  const attachmentBlobs = new Map<string, Blob>();
  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (relativePath.startsWith("attachments/") && !zipEntry.dir) {
      const filename = relativePath.slice("attachments/".length);
      attachmentBlobs.set(filename, await zipEntry.async("blob"));
    }
  }

  return {
    manifest: validated.manifest,
    notes,
    boards,
    connections,
    embeddings,
    settings,
    attachmentFiles: attachmentBlobs,
  };
}

function countSkippedByKind(skipped: { kind: string }[]): ImportReport["skippedLegacyKind"] {
  const counts = new Map<string, number>();
  for (const s of skipped) {
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  }
  return [...counts.entries()].map(([kind, count]) => ({ kind, count }));
}

function normalizeNoteForImport(
  note: Note,
  frameIds: Set<string>,
): { note: Note; unlinked: boolean } {
  const next: Note = { ...note };
  if (next.title !== undefined) {
    const t = normalizeTitle(next.title);
    next.title = t === "" ? undefined : t;
  }
  if (next.frameId && !frameIds.has(next.frameId)) {
    next.frameId = undefined;
    return { note: next, unlinked: true };
  }
  return { note: next, unlinked: false };
}

/** .moss zip → Dexie tx → OPFS blobs. tx 실패 시 notes/boards 변경 없음. */
export async function importMossBundle(
  file: Blob,
  mode: "merge" | "overwrite",
): Promise<ImportReport> {
  const parsed = await parseMossZip(file);
  const { accepted, skipped } = partitionImportNotes(parsed.notes);

  const frameIds = new Set(
    accepted.filter((n) => n.kind === "frame").map((n) => n.id),
  );

  const db = getDB();
  await db.open();

  let skippedDuplicateId = 0;
  let unlinkedFrameRefs = 0;
  const notesToPut: Note[] = [];
  const noteIdSet = new Set(accepted.map((n) => n.id));

  const existingNoteIds =
    mode === "merge"
      ? new Set(await db.notes.toCollection().primaryKeys())
      : new Set<string>();

  for (const raw of accepted) {
    if (mode === "merge" && existingNoteIds.has(raw.id)) {
      skippedDuplicateId++;
      continue;
    }
    const { note, unlinked } = normalizeNoteForImport(raw, frameIds);
    if (unlinked) unlinkedFrameRefs++;
    notesToPut.push(note);
  }

  let boardsToPut = parsed.boards;
  let connectionsToPut = parsed.connections.filter(
    (c) => noteIdSet.has(c.sourceNoteId) && noteIdSet.has(c.targetNoteId),
  );
  let embeddingsToPut = parsed.embeddings.filter((e) => noteIdSet.has(e.noteId));

  if (mode === "merge") {
    const existingBoardIds = new Set(await db.boards.toCollection().primaryKeys());
    boardsToPut = parsed.boards.filter((b) => !existingBoardIds.has(b.id));
    const existingConnIds = new Set(await db.connections.toCollection().primaryKeys());
    connectionsToPut = connectionsToPut.filter((c) => !existingConnIds.has(c.id));
    const existingEmbIds = new Set(await db.embeddings.toCollection().primaryKeys());
    embeddingsToPut = embeddingsToPut.filter((e) => !existingEmbIds.has(e.noteId));
  }

  // 단일 Dexie tx — 실패 시 롤백 (§3-1)
  await db.transaction(
    "rw",
    db.notes,
    db.boards,
    db.connections,
    db.embeddings,
    db.settings,
    async () => {
      if (mode === "overwrite") {
        await Promise.all([
          db.notes.clear(),
          db.boards.clear(),
          db.connections.clear(),
          db.embeddings.clear(),
        ]);
      }
      if (notesToPut.length > 0) await db.notes.bulkPut(notesToPut);
      if (boardsToPut.length > 0) await db.boards.bulkPut(boardsToPut);
      if (connectionsToPut.length > 0) await db.connections.bulkPut(connectionsToPut);
      if (embeddingsToPut.length > 0) await db.embeddings.bulkPut(embeddingsToPut);
      if (mode === "overwrite" && parsed.settings) {
        await db.settings.put({ ...parsed.settings, id: "singleton" });
      }
    },
  );

  // tx 성공 후 OPFS blob 쓰기 — 일부 실패해도 메모는 살림 (AC-10)
  let missingAttachments = 0;
  const refsNeeded = new Set(
    notesToPut.map((n) => n.attachmentRef).filter(Boolean),
  ) as Set<string>;

  for (const ref of refsNeeded) {
    const filename = ref.startsWith("opfs:") ? ref.slice("opfs:".length) : ref;
    const blob = parsed.attachmentFiles.get(filename);
    if (!blob) {
      missingAttachments++;
      continue;
    }
    try {
      await putBlob(filename, blob);
    } catch {
      missingAttachments++;
    }
  }

  const importedFrames = notesToPut.filter((n) => n.kind === "frame").length;

  return {
    imported: {
      notes: notesToPut.length,
      frames: importedFrames,
      boards: boardsToPut.length,
      connections: connectionsToPut.length,
    },
    skippedLegacyKind: countSkippedByKind(skipped),
    skippedDuplicateId,
    missingAttachments,
    unlinkedFrameRefs,
  };
}

/** zip Blob에서 manifest만 읽어 검증 — UI 거부 메시지용. */
export async function peekMossManifest(
  file: Blob,
): Promise<
  | { ok: true; manifest: MossBundleManifest }
  | { ok: false; reason: ImportRejectReason }
> {
  try {
    const parsed = await parseMossZip(file);
    return { ok: true, manifest: parsed.manifest };
  } catch (err) {
    if (err instanceof ImportRejectedError) {
      return { ok: false, reason: err.reason };
    }
    return { ok: false, reason: "not_zip" };
  }
}
