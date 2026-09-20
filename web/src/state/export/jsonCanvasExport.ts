import JSZip from "jszip";
import type { Board, Connection, Note } from "../db/schema";
import { decodeFrameContent } from "../frameContent";

/** Obsidian JSON Canvas — https://jsoncanvas.org */
export interface JsonCanvasNode {
  id: string;
  type: "text" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  label?: string;
  color?: string;
}

export interface JsonCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
}

export interface JsonCanvasDocument {
  nodes: JsonCanvasNode[];
  edges: JsonCanvasEdge[];
}

function noteTextContent(note: Note): string {
  if (note.title) return `# ${note.title}\n\n${note.content}`;
  return note.content;
}

function noteHeight(note: Note): number {
  return note.height ?? 160;
}

/** notes·connections → JSON Canvas document. */
export function buildJsonCanvas(
  notes: Note[],
  connections: Connection[],
): JsonCanvasDocument {
  const nodes: JsonCanvasNode[] = [];
  const noteIds = new Set(notes.map((n) => n.id));

  for (const note of notes) {
    if (note.kind === "frame") {
      nodes.push({
        id: note.id,
        type: "group",
        x: note.x,
        y: note.y,
        width: note.width,
        height: noteHeight(note),
        label: decodeFrameContent(note.content),
      });
      continue;
    }
    if (note.kind === "text" || note.kind === "board") {
      nodes.push({
        id: note.id,
        type: "text",
        x: note.x,
        y: note.y,
        width: note.width,
        height: noteHeight(note),
        text: note.kind === "board" ? `[board:${note.id}]` : noteTextContent(note),
      });
    }
  }

  const edges: JsonCanvasEdge[] = connections
    .filter(
      (c) => noteIds.has(c.sourceNoteId) && noteIds.has(c.targetNoteId),
    )
    .map((c) => ({
      id: c.id,
      fromNode: c.sourceNoteId,
      toNode: c.targetNoteId,
      ...(c.label ? { label: c.label } : {}),
    }));

  return { nodes, edges };
}

/** JSON Canvas .canvas zip (보드당 1 파일). */
export async function exportJsonCanvasZip(
  notes: Note[],
  boards: Board[],
  connections: Connection[],
): Promise<Blob> {
  const zip = new JSZip();
  const byBoard = new Map<string | null, Note[]>();

  for (const n of notes) {
    const key = n.boardId;
    const list = byBoard.get(key) ?? [];
    list.push(n);
    byBoard.set(key, list);
  }

  for (const [boardId, boardNotes] of byBoard) {
    const board = boards.find((b) => b.id === boardId);
    const name =
      board?.name.trim() ||
      (boardId === null ? "system" : boardId ?? "canvas");
    const safeName = name.replace(/[^\w\uAC00-\uD7A3-]+/g, "-") || "canvas";
    const noteIds = new Set(boardNotes.map((n) => n.id));
    const boardConnections = connections.filter(
      (c) => noteIds.has(c.sourceNoteId) && noteIds.has(c.targetNoteId),
    );
    const doc = buildJsonCanvas(boardNotes, boardConnections);
    zip.file(`${safeName}.canvas`, JSON.stringify(doc, null, 2));
  }

  if (byBoard.size === 0) {
    zip.file("empty.canvas", JSON.stringify({ nodes: [], edges: [] }));
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
