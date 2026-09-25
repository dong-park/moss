import { dump as yamlDump } from "js-yaml";
import type { Board, Note } from "../db/schema";
import { decodeFrameContent } from "../frameContent";
import JSZip from "jszip";

export interface MarkdownExportContext {
  notes: Note[];
  boards: Board[];
  boardSlugById: Map<string, string>;
  frameNameById: Map<string, string>;
}

function slugify(input: string): string {
  const base = input
    .trim()
    .slice(0, 60)
    .replace(/[\s]+/g, "-")
    .replace(/[^\w\uAC00-\uD7A3-]+/g, "")
    .replace(/^-+|-+$/g, "");
  return base || "memo";
}

function boardFolderName(board: Board): string {
  const name = board.name.trim();
  return slugify(name === "" ? board.id : name);
}

export function buildMarkdownExportContext(
  notes: Note[],
  boards: Board[],
): MarkdownExportContext {
  const boardSlugById = new Map<string, string>();
  for (const b of boards) {
    boardSlugById.set(b.id, boardFolderName(b));
  }
  const frameNameById = new Map<string, string>();
  for (const n of notes) {
    if (n.kind === "frame") {
      frameNameById.set(n.id, decodeFrameContent(n.content));
    }
  }
  return { notes, boards, boardSlugById, frameNameById };
}

export interface MarkdownFrontmatter {
  id: string;
  kind: string;
  title?: string;
  board?: string;
  frame?: string;
  x: number;
  y: number;
  width: number;
  hasOverlay?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 단일 메모 → frontmatter + 본문 (spec §5). title은 frontmatter에만. */
export function noteToMarkdown(
  note: Note,
  ctx: MarkdownExportContext,
): { filename: string; content: string } {
  const fm: MarkdownFrontmatter = {
    id: note.id,
    kind: note.kind,
    x: note.x,
    y: note.y,
    width: note.width,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };

  if (note.title) fm.title = note.title;
  if (note.boardId && ctx.boardSlugById.has(note.boardId)) {
    fm.board = ctx.boardSlugById.get(note.boardId);
  }
  if (note.frameId && ctx.frameNameById.has(note.frameId)) {
    fm.frame = ctx.frameNameById.get(note.frameId);
  }
  if (note.overlay) fm.hasOverlay = true;

  const frontmatter = yamlDump(fm, { lineWidth: -1 }).trim();
  const body = note.kind === "frame" ? decodeFrameContent(note.content) : note.content;
  const content = `---\n${frontmatter}\n---\n\n${body}`;

  const baseName = note.title ? slugify(note.title) : note.id;
  const filename = `${baseName}.md`;

  return { filename, content };
}

/** zip 내부 경로 — board 폴더 / frame 폴더 (spec §2). */
export function markdownZipPath(
  note: Note,
  ctx: MarkdownExportContext,
  usedNames: Map<string, Set<string>>,
): string {
  const boardPart =
    note.boardId && ctx.boardSlugById.has(note.boardId)
      ? ctx.boardSlugById.get(note.boardId)!
      : "_unassigned";

  let framePart = "";
  if (note.frameId && ctx.frameNameById.has(note.frameId)) {
    framePart = `/${slugify(ctx.frameNameById.get(note.frameId)!)}`;
  }

  const { filename } = noteToMarkdown(note, ctx);
  const folder = `${boardPart}${framePart}`;
  const used = usedNames.get(folder) ?? new Set<string>();
  let finalName = filename;
  if (used.has(finalName)) {
    finalName = `${filename.replace(/\.md$/, "")}-${note.id.slice(0, 6)}.md`;
  }
  used.add(finalName);
  usedNames.set(folder, used);
  return `${folder}/${finalName}`;
}

/** Markdown zip Blob 생성. text·comment·board·frame·textbox만 포함. */
export async function exportMarkdownZip(
  notes: Note[],
  boards: Board[],
): Promise<Blob> {
  const exportNotes = notes.filter(
    (n) =>
      n.kind === "text" ||
      n.kind === "board" ||
      n.kind === "frame" ||
      // FEAT-text-tool AC-7: textbox는 보드 문서 안 평문 단락으로.
      n.kind === "textbox",
  );
  const ctx = buildMarkdownExportContext(notes, boards);
  const zip = new JSZip();
  const usedNames = new Map<string, Set<string>>();

  for (const note of exportNotes) {
    const path = markdownZipPath(note, ctx, usedNames);
    const { content } = noteToMarkdown(note, ctx);
    zip.file(path, content);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
