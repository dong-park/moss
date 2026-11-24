import JSZip from "jszip";
import type { Board, Connection, ConnectionSide, Note } from "../db/schema";
import { decodeFrameConfig } from "../frameContent";
import { attachmentZipPath } from "./attachments";
import { isSystemBoardId, normalizeBoardId } from "../boardIds";
import { isMemoColor, MEMO_COLORS } from "@/components/workspace/memoVariety";

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
  /** group 전용: 배경 이미지 상대 경로(JSON Canvas 스펙). */
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export interface JsonCanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: ConnectionSide;
  toSide?: ConnectionSide;
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
  attachments: Map<string, Blob> = new Map(),
): JsonCanvasDocument {
  const nodes: JsonCanvasNode[] = [];
  const noteIds = new Set(notes.map((n) => n.id));

  for (const note of notes) {
    if (note.kind === "frame") {
      const cfg = decodeFrameConfig(note.content);
      const hasBg = !!note.attachmentRef && attachments.has(note.attachmentRef);
      nodes.push({
        id: note.id,
        type: "group",
        x: note.x,
        y: note.y,
        width: note.width,
        height: noteHeight(note),
        label: cfg.name,
        // 판 높이를 이미지 비율에 맞추므로(D2 답 A) 비율 맞춤으로 싣는다.
        ...(hasBg
          ? { background: attachmentZipPath(note.attachmentRef!), backgroundStyle: "ratio" as const }
          : {}),
      });
      continue;
    }
    // FEAT-text-tool AC-7: textbox도 평문 text 노드로 내보낸다(JSON Canvas type:"text").
    if (note.kind === "text" || note.kind === "board" || note.kind === "textbox") {
      nodes.push({
        id: note.id,
        type: "text",
        x: note.x,
        y: note.y,
        width: note.width,
        height: noteHeight(note),
        text:
          note.kind === "board"
            ? `[board:${note.id}]`
            : noteTextContent(note),
        // 고른 메모 색만 hex로 싣는다. 기본 노랑은 싣지 않는다 (spec/memo-color.md).
        ...(note.kind === "text" && isMemoColor(note.color) ? { color: MEMO_COLORS[note.color] } : {}),
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
      // FEAT-connectors: JSON Canvas 스펙과 동일한 필드명으로 붙는 변을 내보낸다.
      ...(c.sourceSide ? { fromSide: c.sourceSide } : {}),
      ...(c.targetSide ? { toSide: c.targetSide } : {}),
      ...(c.label ? { label: c.label } : {}),
    }));

  return { nodes, edges };
}

/** JSON Canvas .canvas zip (보드당 1 파일). */
export async function exportJsonCanvasZip(
  notes: Note[],
  boards: Board[],
  connections: Connection[],
  attachments: Map<string, Blob> = new Map(),
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
    const key = normalizeBoardId(boardId);
    const name =
      board?.name.trim() || (isSystemBoardId(key) ? "system" : key);
    const safeName = name.replace(/[^\w\uAC00-\uD7A3-]+/g, "-") || "canvas";
    const noteIds = new Set(boardNotes.map((n) => n.id));
    const boardConnections = connections.filter(
      (c) => noteIds.has(c.sourceNoteId) && noteIds.has(c.targetNoteId),
    );
    const doc = buildJsonCanvas(boardNotes, boardConnections, attachments);
    zip.file(`${safeName}.canvas`, JSON.stringify(doc, null, 2));
    for (const n of boardNotes) {
      const blob = n.kind === "frame" && n.attachmentRef ? attachments.get(n.attachmentRef) : undefined;
      if (blob) zip.file(attachmentZipPath(n.attachmentRef!), blob);
    }
  }

  if (byBoard.size === 0) {
    zip.file("empty.canvas", JSON.stringify({ nodes: [], edges: [] }));
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
