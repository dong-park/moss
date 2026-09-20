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

/** 현재 쓰는 논리 종류 — comment는 NoteKind가 아니라 content 마커로 구분. */
export const ACCEPTED_LOGICAL_KINDS = ["text", "comment", "board", "frame"] as const;
export type AcceptedLogicalKind = (typeof ACCEPTED_LOGICAL_KINDS)[number];

const COMMENT_MARKER = "__moss_comment_v1__";
const COMMENT_MARKER_V0 = "$comment";

/** 저장된 text 행이 comment 마커 JSON인지 판별. */
export function isCommentNote(row: {
  kind?: unknown;
  content?: unknown;
}): boolean {
  if (row.kind !== "text") return false;
  if (typeof row.content !== "string" || !row.content.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(row.content) as Record<string, unknown>;
    return (
      parsed[COMMENT_MARKER] === true || parsed[COMMENT_MARKER_V0] === true
    );
  } catch {
    return false;
  }
}

/** import 리포트·partition용 논리 종류. */
export function logicalNoteKind(row: {
  kind?: unknown;
  content?: unknown;
}): string {
  if (isCommentNote(row)) return "comment";
  return typeof row.kind === "string" ? row.kind : "unknown";
}

/** NoteKind 전체 = LEGACY + 현재 3종(text/board/frame). comment는 text+마커. */
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
