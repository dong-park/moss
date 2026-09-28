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
import { useWorkspace, SYSTEM_BOARD_ID } from "../workspace";
import { getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import {
  clearBoardRecords,
  clearSharedSnapshots,
  putBoard,
  putConnection,
  putNote,
  writeToBoardDoc,
} from "@/state/ydoc";
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

/**
 * 가져온 settings.json에서 사용자 설정만 화이트리스트로 뽑는다. 이전 이력
 * (migratedDocs·migrationFailures·dexieMigrationVersion)은 가져온 쪽의 부팅
 * 상태를 오염시키므로 버린다.
 */
function pickUserSettings(raw: Settings | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  return {
    id: "singleton",
    aiOptOutGlobal: raw.aiOptOutGlobal ?? DEFAULT_SETTINGS.aiOptOutGlobal,
    persistGranted: raw.persistGranted ?? DEFAULT_SETTINGS.persistGranted,
    storageQuotaShown: raw.storageQuotaShown ?? DEFAULT_SETTINGS.storageQuotaShown,
    uiLocale: DEFAULT_SETTINGS.uiLocale,
    installPromptShown: raw.installPromptShown ?? DEFAULT_SETTINGS.installPromptShown,
  };
}

/**
 * 신뢰 경계 — boards.json은 사용자가 만든 파일일 수 있다. id는 문자열·유일해야
 * 하고 시스템 보드 id는 쓰기를 가로채므로 거부한다.
 */
function validateImportedBoards(boards: Board[]): void {
  const seen = new Set<string>();
  for (const raw of boards as unknown[]) {
    const board = raw as Partial<Board> | null;
    if (!board || typeof board.id !== "string" || board.id === "") {
      throw new ImportRejectedError("invalid_structure");
    }
    if (board.id === SYSTEM_BOARD_ID) {
      throw new ImportRejectedError("invalid_structure");
    }
    if (seen.has(board.id)) {
      throw new ImportRejectedError("invalid_structure");
    }
    seen.add(board.id);
  }
}

/**
 * n23 P1-2 / 재심사 2R-5: 가져온 메모의 boardId는 null이거나 문자열이어야 한다.
 * 시스템 보드는 스토리지에서 null로 표현하므로 문자열 "system"은 시스템 문서를
 * 가로채는 입력이라 거부하고, 빈 문자열도 거부한다. merge에서는 boardId가 번들
 * boards id 또는 기존 Dexie boards id여야 한다(허용 집합 밖이면 거부).
 */
function validateImportedNotes(
  notes: Note[],
  allowedBoardIds: Set<string>,
): void {
  for (const note of notes as unknown[]) {
    const n = note as Partial<Note> | null;
    if (!n) continue;
    const b = n.boardId;
    if (b === undefined || b === null) continue;
    if (typeof b !== "string" || b === "" || b === SYSTEM_BOARD_ID) {
      throw new ImportRejectedError("invalid_structure");
    }
    if (!allowedBoardIds.has(b)) {
      throw new ImportRejectedError("invalid_structure");
    }
  }
}

/** n23 P1-10: 문서를 동시에 여는 수를 제한한다 — overwrite가 보드 전부를 한꺼번에
 * 열면 IndexedDB 연결·메모리가 급증한다. */
export const IMPORT_DOC_CONCURRENCY = 4;

export async function forEachWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
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
  if (!Array.isArray(boards)) throw new ImportRejectedError("invalid_structure");
  validateImportedBoards(boards);
  const connections = await readJson<Connection[]>("connections.json", []);
  const embeddingsRaw = await readJson<
    { noteId: string; contentHash: string; vector: number[]; updatedAt: number }[]
  >("embeddings.json", []);
  const settings = pickUserSettings(await readJson<Settings | null>("settings.json", null));

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

  // n23 재심사 2R-5: merge의 note.boardId 허용 집합 = 번들 boards ∪ 기존 Dexie
  // boards. overwrite는 기존 boards를 비우므로 번들 boards만 허용한다.
  const existingBoardIds =
    mode === "merge"
      ? new Set<string>(await db.boards.toCollection().primaryKeys())
      : new Set<string>();
  const allowedBoardIds = new Set<string>(parsed.boards.map((b) => b.id));
  if (mode === "merge") {
    for (const id of existingBoardIds) allowedBoardIds.add(id);
  }
  validateImportedNotes(accepted, allowedBoardIds);

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
    boardsToPut = parsed.boards.filter((b) => !existingBoardIds.has(b.id));
    const existingConnIds = new Set(await db.connections.toCollection().primaryKeys());
    connectionsToPut = connectionsToPut.filter((c) => !existingConnIds.has(c.id));
    const existingEmbIds = new Set(await db.embeddings.toCollection().primaryKeys());
    embeddingsToPut = embeddingsToPut.filter((e) => !existingEmbIds.has(e.noteId));
  }

  // overwrite는 기존 보드 문서의 공유 내용도 비운다(작업 3) — Dexie clear와 정합.
  const boardIdsBeforeOverwrite =
    mode === "overwrite"
      ? ((await db.boards.toCollection().primaryKeys()) as string[])
      : [];

  // 단일 Dexie tx — 실패 시 롤백 (§3-1)
  await db.transaction(
    "rw",
    [db.notes, db.boards, db.connections, db.embeddings, db.settings],
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

  // n23 작업 3: 원본은 Y.Doc — 가져온 레코드를 각 보드 문서에 직접 쓴다.
  // overwrite는 먼저 옛 보드 문서를 비운다(새 집합에 없는 보드 정리 포함).
  // n23 재심사 2R-4: clear도 동시 4개로 제한하고 쓰기 직후 닫아(closeNow) 실제
  // 열려 있는 문서 수를 IMPORT_DOC_CONCURRENCY 이하로 유지한다.
  if (mode === "overwrite") {
    await forEachWithConcurrency(
      [null, ...boardIdsBeforeOverwrite] as (string | null)[],
      IMPORT_DOC_CONCURRENCY,
      (boardId) => clearBoardRecords(boardId, { closeNow: true }),
    );
    // 문서를 비웠으니 공유 필드 스냅샷도 버린다 — 옛 값 기준 diff로 새 메모를
    // 낡은 좌표로 덮지 않게.
    clearSharedSnapshots();
  }

  // 보드별로 묶어 문서를 한 번만 연다 — 메모 1,000장도 open 1회.
  const notesByBoard = new Map<string | null, Note[]>();
  for (const note of notesToPut) {
    const key = note.boardId ?? null;
    const list = notesByBoard.get(key);
    if (list) list.push(note);
    else notesByBoard.set(key, [note]);
  }
  const sourceBoard = new Map<string, string | null>();
  for (const note of accepted) sourceBoard.set(note.id, note.boardId ?? null);
  const connsByBoard = new Map<string | null, Connection[]>();
  for (const conn of connectionsToPut) {
    const key = sourceBoard.get(conn.sourceNoteId) ?? null;
    const list = connsByBoard.get(key);
    if (list) list.push(conn);
    else connsByBoard.set(key, [conn]);
  }
  const boardById = new Map(boardsToPut.map((b) => [b.id, b]));
  const touchedBoards = new Set<string | null>([
    ...boardById.keys(),
    ...notesByBoard.keys(),
    ...connsByBoard.keys(),
  ]);
  await forEachWithConcurrency(
    [...touchedBoards],
    IMPORT_DOC_CONCURRENCY,
    (boardId) =>
      writeToBoardDoc(
        boardId,
        (doc) => {
          const board = boardId === null ? undefined : boardById.get(boardId);
          if (board) putBoard(doc, board);
          for (const note of notesByBoard.get(boardId) ?? []) putNote(doc, note);
          for (const conn of connsByBoard.get(boardId) ?? []) putConnection(doc, conn);
        },
        // n23 재심사 2R-4: TTL로 열어 두지 않는다 — 동시 열기 상한이 곧 실제 open 수.
        { closeNow: true },
      ),
  );

  // n23 P1-3 / 재심사 2R-5: 스토어를 문서에서 다시 읽는다.
  // overwrite는 활성 보드가 번들에 없어도(옛 보드가 사라졌어도) 항상 재로드한다 —
  // 안 하면 사라진 보드를 보던 스토어가 낡은 카드를 유지한다. merge는 활성 보드가
  // 실제로 바뀐 경우만.
  if (mode === "overwrite") {
    await useWorkspace.getState().loadFromStorage();
  } else if (getActiveBoardDoc() !== null) {
    const current = useWorkspace.getState().currentBoardId;
    const activeStorageId = current === SYSTEM_BOARD_ID ? null : current;
    if (touchedBoards.has(activeStorageId)) {
      await useWorkspace.getState().loadFromStorage();
    }
  }

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
