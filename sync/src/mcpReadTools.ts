import * as Y from "yjs";
import { z } from "zod";
import {
  CONNECTIONS_MAP,
  CONNECTION_FIELDS,
  FILES_MAP,
  META_MAP,
  NOTES_MAP,
  NOTE_FIELDS,
  readFields,
} from "@moss/doc-model";
import { defineTool, McpToolError, type McpBoardInfo, type McpTool } from "./mcp.ts";

/** Read tools of the remote MCP endpoint (RM-5): list_boards, read_board, search. */

/** Cap on the text of one read_board reply, so a huge board cannot flood the agent's context. */
export const MAX_READ_CHARS = 120_000;
/** Cap on boards one search opens, and on hits it returns. */
export const MAX_SEARCH_BOARDS = 30;
export const MAX_SEARCH_HITS = 30;

interface NoteView {
  id: string;
  kind: string;
  title?: string;
  content?: string;
  color?: string;
  textSize?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  frameId?: string;
  attachmentRef?: string;
  mediaType?: string;
  createdAt?: number;
}

interface ConnectionView {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  status?: string;
  label?: string;
}

interface BoardView {
  name: string;
  notes: NoteView[];
  connections: ConnectionView[];
  /** Local attachment ref to server file id, as the browsers wrote it. */
  files: Map<string, string>;
}

const isYMap = (value: unknown): value is Y.Map<unknown> => value instanceof Y.Map;

/** Plain view of a board document. Entries without an id are skipped, like the web reader does. */
export function viewBoard(doc: Y.Doc, fallbackName: string): BoardView {
  const notes: NoteView[] = [];
  for (const value of doc.getMap<unknown>(NOTES_MAP).values()) {
    if (!isYMap(value)) continue;
    const note = readFields<NoteView>(value, NOTE_FIELDS);
    if (typeof note.id === "string" && typeof note.kind === "string") notes.push(note);
  }
  notes.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));

  const connections: ConnectionView[] = [];
  for (const value of doc.getMap<unknown>(CONNECTIONS_MAP).values()) {
    if (!isYMap(value)) continue;
    const connection = readFields<ConnectionView>(value, CONNECTION_FIELDS);
    if (typeof connection.id === "string") connections.push(connection);
  }
  connections.sort((a, b) => a.id.localeCompare(b.id));

  const files = new Map<string, string>();
  for (const [key, value] of doc.getMap<unknown>(FILES_MAP).entries()) {
    if (typeof value === "string" && value !== "") files.set(key, value);
  }
  const metaName = doc.getMap<unknown>(META_MAP).get("name");
  return { name: typeof metaName === "string" && metaName !== "" ? metaName : fallbackName, notes, connections, files };
}

function frameName(note: NoteView): string {
  try {
    const parsed: unknown = JSON.parse(note.content ?? "");
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as { name?: unknown }).name === "string") {
      return (parsed as { name: string }).name;
    }
  } catch {
    // Not JSON: fall through to the plain label.
  }
  return "";
}

/** Short label for a note: its title, a frame's name, or the first content line. */
function noteLabel(note: NoteView): string {
  if (note.kind === "frame") return frameName(note) || "(이름 없는 메모판)";
  const title = note.title?.trim();
  if (title) return title;
  const firstLine = (note.content ?? "").split("\n").find((line) => line.trim() !== "")?.trim();
  return firstLine ? firstLine.slice(0, 60) : "(" + note.kind + ")";
}

/** Attachment name: the server's file name, else the name inside the local ref. */
function attachmentName(note: NoteView, view: BoardView, serverNames: Map<string, string>): string | undefined {
  const ref = note.attachmentRef;
  if (ref === undefined || ref === "") return undefined;
  const fileId = view.files.get(ref);
  if (fileId !== undefined) return serverNames.get(fileId) ?? ref.replace(/^opfs:/, "");
  return view.files.has("!failed:" + ref) ? ref.replace(/^opfs:/, "") + " (올리지 못함)" : ref.replace(/^opfs:/, "") + " (올리는 중)";
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

export function renderBoard(boardId: string, view: BoardView, serverNames: Map<string, string>): string {
  const byId = new Map(view.notes.map((note) => [note.id, note]));
  const head =
    "# " + view.name + " (" + boardId + ")\n\n" +
    "메모 " + view.notes.length + "개 · 연결 " + view.connections.length + "개";

  const parts: string[] = [];
  for (const note of view.notes) {
    const lines = ["### " + oneLine(noteLabel(note)) + " [" + note.id + "]"];
    const facts = ["종류 " + note.kind];
    if (note.color) facts.push("색 " + note.color);
    if (note.textSize) facts.push("글자 크기 " + note.textSize);
    if (typeof note.x === "number" && typeof note.y === "number") facts.push("위치 (" + note.x + ", " + note.y + ")");
    if (typeof note.width === "number") facts.push("크기 " + note.width + "×" + (note.height ?? "자동"));
    const frame = note.frameId === undefined ? undefined : byId.get(note.frameId);
    if (frame !== undefined) facts.push("메모판 " + oneLine(noteLabel(frame)));
    lines.push("- " + facts.join(" · "));
    const attachment = attachmentName(note, view, serverNames);
    if (attachment !== undefined) lines.push("- 첨부: " + attachment + (note.mediaType ? " (" + note.mediaType + ")" : ""));
    if (note.kind !== "frame" && note.content) lines.push("", note.content);
    parts.push(lines.join("\n"));
  }

  const connectionLines = view.connections
    .filter((connection) => connection.status !== "rejected")
    .map((connection) => {
      const source = byId.get(connection.sourceNoteId);
      const target = byId.get(connection.targetNoteId);
      const name = (note: NoteView | undefined, id: string) =>
        note === undefined ? id : oneLine(noteLabel(note)) + " [" + id + "]";
      const label = connection.label ? " (" + connection.label + ")" : "";
      return "- " + name(source, connection.sourceNoteId) + " → " + name(target, connection.targetNoteId) + label;
    });

  const sections = [head];
  if (parts.length > 0) sections.push("## 메모\n\n" + parts.join("\n\n"));
  if (connectionLines.length > 0) sections.push("## 연결\n\n" + connectionLines.join("\n"));

  let text = sections.join("\n\n");
  if (text.length > MAX_READ_CHARS) {
    text = text.slice(0, MAX_READ_CHARS) + "\n\n…(보드가 길어서 여기서 잘랐어요. search로 필요한 메모를 찾으세요.)";
  }
  return text;
}

function boardLine(board: McpBoardInfo, byId: Map<string, McpBoardInfo>): string {
  const parent = board.parentId === null ? undefined : byId.get(board.parentId);
  const where = parent === undefined ? "" : " · [" + parent.name + "] 안의 보드";
  return "- " + board.name + " (" + board.id + ") · 내 역할 " + board.role + where;
}

const boardArg = z.string().min(1).max(64).describe("보드 id. list_boards가 돌려준 값");

export const listBoardsTool = defineTool({
  name: "list_boards",
  description: "내가 멤버인 moss 보드의 목록(id, 이름)을 돌려준다. 다른 도구에 넣을 보드 id를 여기서 얻는다.",
  inputSchema: {},
  readOnly: true,
  async call(_args, context) {
    const boards = await context.listBoards();
    if (boards.length === 0) return "멤버인 보드가 없어요.";
    const byId = new Map(boards.map((board) => [board.id, board]));
    return "보드 " + boards.length + "개\n\n" + boards.map((board) => boardLine(board, byId)).join("\n");
  },
});

export const readBoardTool = defineTool({
  name: "read_board",
  description:
    "보드 하나를 마크다운으로 통째로 읽는다. 메모(제목·본문·색·글자 크기·위치·첨부 이름), 연결선, 메모판 소속이 들어 있다.",
  inputSchema: { board: boardArg },
  readOnly: true,
  async call({ board }, context) {
    const doc = await context.readDoc(board);
    const info = (await context.listBoards()).find((candidate) => candidate.id === board);
    return renderBoard(board, viewBoard(doc, info?.name ?? board), await context.fileNames(board));
  },
});

function snippet(text: string, query: string): string {
  const flat = oneLine(text);
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return flat.slice(0, 120);
  const start = Math.max(0, at - 40);
  return (start > 0 ? "…" : "") + flat.slice(start, at + query.length + 80) + (at + query.length + 80 < flat.length ? "…" : "");
}

export const searchTool = defineTool({
  name: "search",
  description:
    "메모 제목·본문, 연결선 이름표, 첨부 이름에서 글자를 찾는다(대소문자 무시). board를 주면 그 보드만, 안 주면 멤버인 보드 전체를 찾는다.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).describe("찾을 글자"),
    board: boardArg.optional().describe("한 보드로 좁힐 때만"),
  },
  readOnly: true,
  async call({ query, board }, context) {
    const all = await context.listBoards();
    let targets = all;
    if (board !== undefined) {
      targets = all.filter((candidate) => candidate.id === board);
      if (targets.length === 0) throw new McpToolError("board not found or not accessible");
    }
    const notices: string[] = [];
    if (targets.length > MAX_SEARCH_BOARDS) {
      notices.push("보드가 많아 이름순 앞 " + MAX_SEARCH_BOARDS + "개만 찾았어요. board로 좁혀 다시 찾아보세요.");
      targets = targets.slice(0, MAX_SEARCH_BOARDS);
    }

    const needle = query.toLowerCase();
    const hits: string[] = [];
    let total = 0;
    for (const target of targets) {
      const doc = await context.readDoc(target.id);
      const view = viewBoard(doc, target.name);
      const names = view.notes.some((note) => note.attachmentRef) ? await context.fileNames(target.id) : new Map<string, string>();
      const byId = new Map(view.notes.map((note) => [note.id, note]));
      const record = (where: string, text: string) => {
        total += 1;
        if (hits.length < MAX_SEARCH_HITS) hits.push("- " + target.name + " (" + target.id + ") · " + where + " · " + snippet(text, query));
      };
      for (const note of view.notes) {
        const attachment = attachmentName(note, view, names);
        const fields: Array<[string, string | undefined]> = [
          ["제목", note.kind === "frame" ? frameName(note) : note.title],
          ["본문", note.kind === "frame" ? undefined : note.content],
          ["첨부", attachment],
        ];
        for (const [field, text] of fields) {
          if (text && text.toLowerCase().includes(needle)) {
            record("메모 " + oneLine(noteLabel(note)) + " [" + note.id + "] " + field, text);
            break;
          }
        }
      }
      for (const connection of view.connections) {
        if (connection.label && connection.status !== "rejected" && connection.label.toLowerCase().includes(needle)) {
          const source = byId.get(connection.sourceNoteId);
          const target2 = byId.get(connection.targetNoteId);
          const ends = [source, target2].map((note, i) => note === undefined ? "?" : oneLine(noteLabel(note)) + (i === 0 ? " →" : "")).join(" ");
          record("연결 " + ends + " 이름표", connection.label);
        }
      }
    }

    if (total === 0) return ["찾은 게 없어요: " + query, ...notices].join("\n");
    const more = total > hits.length ? "\n\n" + (total - hits.length) + "건 더 있어요. board나 더 긴 검색어로 좁혀 보세요." : "";
    return ["찾은 곳 " + total + "건: " + query, "", ...hits].join("\n") + more + (notices.length > 0 ? "\n\n" + notices.join("\n") : "");
  },
});

export const readTools: readonly McpTool[] = [listBoardsTool, readBoardTool, searchTool];
