import type { Note, NoteKind } from "../db/schema";
import { LEGACY_NOTE_KINDS } from "./legacyKinds";

export interface PartitionImportNotesResult {
  accepted: Note[];
  skipped: { kind: string }[];
}

const ACCEPTED_KINDS: ReadonlySet<NoteKind> = new Set([
  "text",
  "board",
  "frame",
  "textbox",
]);

function isNoteShape(row: unknown): row is Note {
  if (!row || typeof row !== "object") return false;
  const r = row as Partial<Note>;
  return (
    typeof r.id === "string" &&
    typeof r.kind === "string" &&
    typeof r.content === "string" &&
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.width === "number" &&
    typeof r.rotation === "number" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number" &&
    typeof r.lastVisitedAt === "number" &&
    typeof r.aiOptOut === "boolean"
  );
}

/**
 * 가져올 notes.json 행을 accepted/skipped로 분할 — 옛 종류 판정 단일 소스 (spec §6).
 */
export function partitionImportNotes(rows: unknown[]): PartitionImportNotesResult {
  const accepted: Note[] = [];
  const skipped: { kind: string }[] = [];

  for (const row of rows) {
    if (!isNoteShape(row)) {
      skipped.push({ kind: "invalid" });
      continue;
    }

    if (LEGACY_NOTE_KINDS.has(row.kind)) {
      skipped.push({ kind: row.kind });
      continue;
    }

    if (ACCEPTED_KINDS.has(row.kind)) {
      accepted.push(row);
      continue;
    }

    skipped.push({ kind: row.kind });
  }

  return { accepted, skipped };
}
