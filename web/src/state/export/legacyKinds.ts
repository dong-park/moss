import type { NoteKind } from "../db/schema";

export const CURRENT_SCHEMA_VERSION = 5;

/** 옛 종류 — 가져오기 시 건너뛴다 (spec §2). */
export const LEGACY_NOTE_KINDS: ReadonlySet<NoteKind> = new Set([
  "image",
  "link",
  "audio",
  "file",
  "mindmap",
  "handwriting",
  "highlight",
  "checklist",
  "code",
]);

/** 현재 쓰는 논리 종류. */
export const ACCEPTED_LOGICAL_KINDS = ["text", "board", "frame"] as const;
export type AcceptedLogicalKind = (typeof ACCEPTED_LOGICAL_KINDS)[number];

/** import 리포트·partition용 논리 종류. */
export function logicalNoteKind(row: {
  kind?: unknown;
  content?: unknown;
}): string {
  return typeof row.kind === "string" ? row.kind : "unknown";
}

/** NoteKind 전체 = LEGACY + 현재 3종(text/board/frame). */
export const ALL_NOTE_KINDS: readonly NoteKind[] = [
  "text",
  "handwriting",
  "mindmap",
  "highlight",
  "checklist",
  "image",
  "link",
  "audio",
  "file",
  "code",
  "board",
  "frame",
];
