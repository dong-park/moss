import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { z } from "zod";
import {
  CONNECTIONS_MAP,
  FILES_MAP,
  LOCAL_REF_PREFIX,
  NOTES_MAP,
  NOTE_FIELDS,
  PROVENANCE_FIELDS,
  fileBlockMarkdown,
  imageBlockMarkdown,
  readFields,
} from "@moss/doc-model";
import {
  MAX_MCP_BODY_BYTES,
  McpToolError,
  defineTool,
  type BoardConnection,
  type McpTool,
  type McpWriteContext,
} from "./mcp.ts";
import { UNTRUSTED_BOARD_NOTICE } from "./mcpReadTools.ts";

/** Write tools of the remote MCP endpoint (RM-6): notes, connections, attachments. */

export const MAX_CONTENT_CHARS = 20_000;
export const MAX_TITLE_CHARS = 80;
/** Where a note goes on an empty board; matches the web's seed area. */
const FIRST_SPOT = { x: 320, y: 140 };
const GRID_STEP = 40;
const NOTE_GAP = 24;
/** A new note is searched for in a band this wide, then goes under everything. */
const SEARCH_WIDTH = 1600;
const TEXT_NOTE_SIZE = 240;
const TEXTBOX_WIDTH = 320;
/** Textboxes store no height; this is the guess used only to keep new notes off them. */
const TEXTBOX_GUESS_HEIGHT = 48;
/** Kinds whose position, size or content belong to the user's board structure, not to the agent. */
const PROTECTED_KINDS = new Set(["frame", "board"]);

const MEMO_COLORS = ["blue", "lime", "purple", "pink"] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TEXT_SIZES = ["s", "m", "l", "xl"] as const;

const boardArg = z.string().min(1).max(64).describe("보드 id. list_boards가 돌려준 값");
const noteArg = z.string().min(1).max(100).describe("메모 id. read_board가 [] 안에 보여 주는 값");
const colorArg = z
  .string()
  .max(20)
  .describe("메모(text)는 blue·lime·purple·pink 중 하나, 글상자(textbox)는 #rrggbb. 기본 색은 비워 둔다");
const textSizeArg = z.enum(TEXT_SIZES).describe("글자 크기 s·m·l·xl (글상자에서 보인다)");

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smallest grid point at or after `value` on the grid that starts at `origin`. */
const snap = (value: number, origin: number) => origin + Math.ceil((value - origin) / GRID_STEP) * GRID_STEP;

/**
 * First spot, scanning rows from the top-left of the existing notes, where a width×height note
 * keeps NOTE_GAP from every other note. A full board gets the spot under everything.
 *
 * Notes are sorted by top, so a row only looks at the notes that reach it. Inside a row the scan jumps to the
 * first grid point past the note it hit, and a full row jumps to the first grid row where one of the notes that
 * filled it has ended. Both jumps skip only spots that are taken, so the result is the same as trying every grid point.
 */
export function findFreeSpot(boxes: readonly Box[], width: number, height: number): { x: number; y: number } {
  if (boxes.length === 0) return { ...FIRST_SPOT };
  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxY = Math.max(maxY, box.y + box.height);
  }
  const limit = minX + Math.max(SEARCH_WIDTH, width);
  // The area a note keeps clear around itself.
  const padded = boxes
    .map((box) => ({
      left: box.x - NOTE_GAP,
      top: box.y - NOTE_GAP,
      right: box.x + box.width + NOTE_GAP,
      bottom: box.y + box.height + NOTE_GAP,
    }))
    .sort((a, b) => a.top - b.top);
  let next = 0;
  let active: typeof padded = [];
  for (let y = minY; y <= maxY; ) {
    while (next < padded.length && padded[next]!.top < y + height) active.push(padded[next++]!);
    active = active.filter((box) => box.bottom > y);
    active.sort((a, b) => a.left - b.left);
    let x = minX;
    let rowEnd = Infinity;
    for (const box of active) {
      if (box.left >= x + width) break;
      if (box.right > x) {
        x = snap(box.right, minX);
        rowEnd = Math.min(rowEnd, box.bottom);
      }
      if (x + width > limit) break;
    }
    if (x + width <= limit) return { x, y };
    y = snap(rowEnd, minY);
  }
  return { x: minX, y: maxY + NOTE_GAP };
}

const isYMap = (value: unknown): value is Y.Map<unknown> => value instanceof Y.Map;

/** Boxes of the notes already on the board. Frames are backgrounds, so they do not block a spot. */
function noteBoxes(doc: Y.Doc): Box[] {
  const boxes: Box[] = [];
  for (const value of doc.getMap<unknown>(NOTES_MAP).values()) {
    if (!isYMap(value)) continue;
    const note = readFields<{ kind?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown }>(value, NOTE_FIELDS);
    if (note.kind === "frame" || typeof note.x !== "number" || typeof note.y !== "number") continue;
    const width = typeof note.width === "number" ? note.width : TEXT_NOTE_SIZE;
    const height = typeof note.height === "number" ? note.height : note.kind === "textbox" ? TEXTBOX_GUESS_HEIGHT : width;
    boxes.push({ x: note.x, y: note.y, width, height });
  }
  return boxes;
}

const newId = (prefix: string) => prefix + "-" + Date.now().toString(36) + "-" + randomUUID().slice(0, 8);

/** Who wrote last, kept in fields the web ignores (D6 → A). Nothing is shown in the UI yet. */
function stamp(map: Y.Map<unknown>, context: McpWriteContext, now: number): void {
  const [clientField, atField] = PROVENANCE_FIELDS;
  map.set(clientField, (context.clientId ?? "mcp").slice(0, 200));
  map.set(atField, now);
}

/** One-line title of at most 80 characters, like the web's normalizeTitle. */
function normalizeTitle(input: string): string {
  return input.replace(/[\r\n\t]+/g, " ").slice(0, MAX_TITLE_CHARS).trim();
}

function checkColor(kind: unknown, color: string): void {
  if (color === "") return;
  if (kind === "text") {
    if (!(MEMO_COLORS as readonly string[]).includes(color)) {
      throw new McpToolError("메모 색은 " + MEMO_COLORS.join("·") + " 중 하나예요");
    }
  } else if (kind === "textbox") {
    if (!HEX_COLOR.test(color)) throw new McpToolError("글상자 색은 #rrggbb 모양이어야 해요");
  } else {
    throw new McpToolError("이 종류의 메모는 색을 바꿀 수 없어요");
  }
}

function openDocument(connection: BoardConnection): Y.Doc {
  const document = connection.document;
  if (document === null) throw new Error("direct connection closed");
  return document;
}

/**
 * Applies `fn` in one Yjs transaction on an open connection. The size check comes first because the store
 * drops an over-limit snapshot without telling the writer, so a change that would not fit has to stop here.
 * `fn` must validate before it changes anything: a throw cannot undo edits already made.
 */
async function applyEdit<T>(
  context: McpWriteContext,
  connection: BoardConnection,
  addedBytes: number,
  fn: (doc: Y.Doc) => T,
): Promise<T> {
  assertRoom(context, openDocument(connection), addedBytes);
  let result: T;
  await connection.transact((doc) => {
    result = doc.transact(() => fn(doc));
  });
  return result!;
}

/** Opens the board for writing and applies `fn` (see `applyEdit`). */
function editBoard<T>(context: McpWriteContext, board: string, addedBytes: number, fn: (doc: Y.Doc) => T): Promise<T> {
  return context.withBoard(board, (connection) => applyEdit(context, connection, addedBytes, fn));
}

function assertRoom(context: McpWriteContext, doc: Y.Doc, addedBytes: number): void {
  // encodeStateAsUpdate over-counts nothing the store would not also write.
  if (Y.encodeStateAsUpdate(doc).byteLength + addedBytes > context.maxDocumentBytes) {
    throw new McpToolError("보드가 가득 차서 더 쓸 수 없어요. 메모를 지우거나 다른 보드를 쓰세요.");
  }
}

/** Rough bytes one new note adds, with room for the Yjs bookkeeping around its fields. */
const noteBytes = (...texts: Array<string | undefined>) =>
  1024 + texts.reduce((sum, text) => sum + Buffer.byteLength(text ?? "", "utf8"), 0);

const where = (x: number, y: number) => "(" + Math.round(x) + ", " + Math.round(y) + ")";

export const createNoteTool = defineTool({
  name: "create_note",
  description:
    "보드에 메모를 하나 만든다. 자리와 폭은 다른 메모와 겹치지 않게 자동으로 정해진다. 만든 메모의 id를 돌려준다. " +
    "kind는 text(종이 메모, 기본)와 textbox(종이 없는 글상자) 중 고른다. 사용자의 화면에 몇 초 안에 나타난다.",
  inputSchema: {
    board: boardArg,
    content: z.string().max(MAX_CONTENT_CHARS).describe("본문(마크다운)"),
    title: z.string().max(200).optional().describe("제목 한 줄, 80자까지"),
    kind: z.enum(["text", "textbox"]).optional(),
    color: colorArg.optional(),
    textSize: textSizeArg.optional(),
  },
  async call({ board, content, title, kind, color, textSize }, context) {
    const noteKind = kind ?? "text";
    const cleanTitle = title === undefined ? "" : normalizeTitle(title);
    if (content.trim() === "" && cleanTitle === "") throw new McpToolError("content나 title 중 하나는 있어야 해요");
    if (color !== undefined) checkColor(noteKind, color);

    return editBoard(context, board, noteBytes(content, cleanTitle), (doc) => {
      const isTextbox = noteKind === "textbox";
      const width = isTextbox ? TEXTBOX_WIDTH : TEXT_NOTE_SIZE;
      const height = isTextbox ? undefined : TEXT_NOTE_SIZE;
      const spot = findFreeSpot(noteBoxes(doc), width, height ?? TEXTBOX_GUESS_HEIGHT);
      const now = Date.now();
      const id = newId("mcp");
      const note: Record<string, unknown> = {
        id,
        boardId: board,
        kind: noteKind,
        x: spot.x,
        y: spot.y,
        width,
        rotation: 0,
        content,
        aiOptOut: isTextbox,
        createdAt: now,
        updatedAt: now,
        ...(height !== undefined ? { height } : {}),
        ...(cleanTitle !== "" ? { title: cleanTitle } : {}),
        ...(color !== undefined && color !== "" ? { color } : {}),
        ...(textSize !== undefined ? { textSize } : isTextbox ? { textSize: "m" } : {}),
        ...(isTextbox ? { autoWidth: false } : {}),
      };
      const map = new Y.Map<unknown>();
      for (const field of NOTE_FIELDS) {
        const value = note[field];
        if (value !== undefined) map.set(field, value);
      }
      stamp(map, context, now);
      doc.getMap<Y.Map<unknown>>(NOTES_MAP).set(id, map);
      return "메모를 만들었어요: [" + id + "] · 위치 " + where(spot.x, spot.y);
    });
  },
});

export const updateNoteTool = defineTool({
  name: "update_note",
  description:
    "메모의 본문·제목·색·글자 크기를 고친다. 준 항목만 바뀐다. title을 빈 문자열로 주면 제목이 지워진다. 메모판·함 카드는 고칠 수 없다.",
  inputSchema: {
    board: boardArg,
    id: noteArg,
    content: z.string().max(MAX_CONTENT_CHARS).optional(),
    title: z.string().max(200).optional(),
    color: colorArg.optional(),
    textSize: textSizeArg.optional(),
  },
  async call({ board, id, content, title, color, textSize }, context) {
    if (content === undefined && title === undefined && color === undefined && textSize === undefined) {
      throw new McpToolError("content, title, color, textSize 중 하나는 줘야 해요");
    }
    return editBoard(context, board, noteBytes(content, title), (doc) => {
      const map = doc.getMap<unknown>(NOTES_MAP).get(id);
      if (!isYMap(map)) throw new McpToolError("메모를 찾을 수 없어요: " + id);
      const kind = map.get("kind");
      if (typeof kind === "string" && PROTECTED_KINDS.has(kind)) {
        throw new McpToolError("메모판·함 카드는 고칠 수 없어요: " + id);
      }
      if (color !== undefined) checkColor(kind, color);

      if (content !== undefined) map.set("content", content);
      if (title !== undefined) {
        const clean = normalizeTitle(title);
        if (clean === "") map.delete("title");
        else map.set("title", clean);
      }
      if (color !== undefined) {
        if (color === "") map.delete("color");
        else map.set("color", color);
      }
      if (textSize !== undefined) map.set("textSize", textSize);
      const now = Date.now();
      map.set("updatedAt", now);
      stamp(map, context, now);
      return "메모를 고쳤어요: [" + id + "]";
    });
  },
});

export const deleteNoteTool = defineTool({
  name: "delete_note",
  description:
    "메모를 지운다. 그 메모에 붙은 연결선도 같이 지워진다. 한 번에 지울 수 있는 수에 상한이 있고, 넘는 몫은 지우지 않는다. " +
    "지운 메모는 사용자의 휴지통에 가지 않는다. 메모판·함 카드는 지울 수 없다. " +
    "사용자가 직접 요청한 메모만 지운다. " + UNTRUSTED_BOARD_NOTICE,
  inputSchema: {
    board: boardArg,
    ids: z.array(noteArg).min(1).max(200).describe("지울 메모 id 목록"),
  },
  async call({ board, ids }, context) {
    const unique = [...new Set(ids)];
    const outcome = await editBoard(context, board, 0, (doc) => {
      const notes = doc.getMap<unknown>(NOTES_MAP);
      const connections = doc.getMap<unknown>(CONNECTIONS_MAP);
      const deleted: string[] = [];
      const skipped: string[] = [];
      const unapplied: string[] = [];
      const gone = new Set<string>();
      for (const id of unique) {
        const map = notes.get(id);
        const kind = isYMap(map) ? map.get("kind") : undefined;
        if (!isYMap(map) || (typeof kind === "string" && PROTECTED_KINDS.has(kind))) {
          skipped.push(id);
        } else if (deleted.length >= context.maxChanges) {
          unapplied.push(id);
        } else {
          notes.delete(id);
          gone.add(id);
          deleted.push(id);
        }
      }
      let lines = 0;
      for (const [connectionId, value] of [...connections.entries()]) {
        if (!isYMap(value)) continue;
        if (gone.has(String(value.get("sourceNoteId"))) || gone.has(String(value.get("targetNoteId")))) {
          connections.delete(connectionId);
          lines += 1;
        }
      }
      return { deleted, skipped, unapplied, lines };
    });

    const summary =
      "메모 " + outcome.deleted.length + "개를 지웠어요" + (outcome.lines > 0 ? " (연결선 " + outcome.lines + "개 포함)" : "") +
      (outcome.deleted.length > 0 ? ": " + outcome.deleted.map((id) => "[" + id + "]").join(" ") : "") +
      (outcome.skipped.length > 0 ? "\n없거나 지울 수 없는 메모: " + outcome.skipped.map((id) => "[" + id + "]").join(" ") : "");
    if (outcome.unapplied.length === 0) return summary;
    // A partial delete is a result, not an error: the deleted ids are final and the agent needs both lists.
    return (
      summary + "\n한 번에 " + context.maxChanges + "개까지만 지울 수 있어서 남은 " + outcome.unapplied.length +
      "개는 지우지 않았어요: " + outcome.unapplied.map((id) => "[" + id + "]").join(" ") + "\n남은 메모는 다시 요청해 주세요."
    );
  },
});

export const createConnectionTool = defineTool({
  name: "create_connection",
  description: "메모 두 개를 선으로 잇는다(source → target). 같은 방향으로 이미 이어져 있으면 그 선의 id를 돌려준다.",
  inputSchema: {
    board: boardArg,
    sourceNoteId: noteArg,
    targetNoteId: noteArg,
    label: z.string().max(120).optional().describe("선 이름표"),
  },
  async call({ board, sourceNoteId, targetNoteId, label }, context) {
    if (sourceNoteId === targetNoteId) throw new McpToolError("같은 메모끼리는 이을 수 없어요");
    return editBoard(context, board, noteBytes(label), (doc) => {
      const notes = doc.getMap<unknown>(NOTES_MAP);
      for (const id of [sourceNoteId, targetNoteId]) {
        if (!isYMap(notes.get(id))) throw new McpToolError("메모를 찾을 수 없어요: " + id);
      }
      const connections = doc.getMap<unknown>(CONNECTIONS_MAP);
      for (const [existingId, value] of connections.entries()) {
        if (
          isYMap(value) &&
          value.get("sourceNoteId") === sourceNoteId &&
          value.get("targetNoteId") === targetNoteId &&
          value.get("status") === "active"
        ) {
          return "이미 이어져 있어요: [" + existingId + "]";
        }
      }
      const id = newId("conn-mcp");
      const now = Date.now();
      const map = new Y.Map<unknown>();
      map.set("id", id);
      map.set("sourceNoteId", sourceNoteId);
      map.set("targetNoteId", targetNoteId);
      map.set("source", "manual");
      map.set("status", "active");
      map.set("createdAt", now);
      const cleanLabel = label?.replace(/\s+/g, " ").trim();
      if (cleanLabel) map.set("label", cleanLabel);
      stamp(map, context, now);
      connections.set(id, map);
      return "연결선을 만들었어요: [" + id + "]";
    });
  },
});

export const deleteConnectionTool = defineTool({
  name: "delete_connection",
  description: "연결선을 지운다. 이어진 메모는 그대로 남는다.",
  inputSchema: {
    board: boardArg,
    id: z.string().min(1).max(100).describe("연결선 id. read_board의 연결 목록에는 이름이 보이고, id는 create_connection이 돌려준 값"),
  },
  async call({ board, id }, context) {
    return editBoard(context, board, 0, (doc) => {
      const connections = doc.getMap<unknown>(CONNECTIONS_MAP);
      if (!isYMap(connections.get(id))) throw new McpToolError("연결선을 찾을 수 없어요: " + id);
      connections.delete(id);
      return "연결선을 지웠어요: [" + id + "]";
    });
  },
});

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
/** Base64 grows data by a third, and the rest of the request body needs room too. */
export const MAX_ATTACHMENT_BYTES = Math.floor(((MAX_MCP_BODY_BYTES - 4096) * 3) / 4);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** Room the attachment's files-map entry takes on top of its note. */
const FILES_ENTRY_BYTES = 256;
/** Room one attachment note needs. The check before the upload and the one at the write use this same number. */
const attachmentBytes = (name: string, caption: string | undefined) => noteBytes(name, caption) + FILES_ENTRY_BYTES;

/** A file name safe for a local reference and a Markdown label: no path parts, no control characters. */
function safeFileName(input: string): string {
  const base = input.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  return clean === "" || clean === "." || clean === ".." ? "file" : clean;
}

/** Deletes a stored file no note points at. A failure only leaves a log line: the tool already failed for its own reason. */
async function discardUpload(context: McpWriteContext, board: string, fileId: string): Promise<void> {
  try {
    await context.removeFile(board, fileId);
  } catch (error) {
    console.warn("mcp upload left an orphan file:", board, fileId, error instanceof Error ? error.message : error);
  }
}

export const uploadAttachmentTool = defineTool({
  name: "upload_attachment",
  description:
    "파일(이미지·PDF·문서 등)을 base64로 올려 보드에 메모로 붙인다. 이미지는 그림으로, 그 밖의 파일은 파일 블록으로 보인다. " +
    "파일은 요청 한 번에 담아 보내므로 약 750KB까지 올릴 수 있다. 저장 용량을 넘으면 거절된다.",
  inputSchema: {
    board: boardArg,
    filename: z.string().min(1).max(200).describe("파일 이름(확장자 포함)"),
    dataBase64: z.string().min(1).max(MAX_MCP_BODY_BYTES).describe("파일 내용을 base64로 인코딩한 값"),
    mimeType: z.string().max(100).optional().describe("예: image/png, application/pdf. 모르면 생략"),
    caption: z.string().max(500).optional().describe("파일 아래에 적을 글"),
  },
  async call({ board, filename, dataBase64, mimeType, caption }, context) {
    const compact = dataBase64.replace(/\s+/g, "");
    if (!BASE64.test(compact) || compact.length % 4 === 1) throw new McpToolError("dataBase64가 올바른 base64가 아니에요");
    const bytes = Buffer.from(compact, "base64");
    if (bytes.byteLength === 0) throw new McpToolError("빈 파일은 올릴 수 없어요");
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new McpToolError("파일이 너무 커요. 한 번에 약 " + Math.floor(MAX_ATTACHMENT_BYTES / 1024) + "KB까지 올릴 수 있어요");
    }
    const name = safeFileName(filename);
    const type = (mimeType ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase() || "application/octet-stream";
    const added = attachmentBytes(name, caption);

    // One connection for the room check, the upload and the note, so the board is opened and stored once.
    return context.withBoard(board, async (connection) => {
      // Room first, so a full board does not leave a stored file nobody can see.
      assertRoom(context, openDocument(connection), added);
      const stored = await context.uploadFile(board, { name, type, bytes });
      try {
        return await applyEdit(context, connection, added, (doc) => {
          const ref = LOCAL_REF_PREFIX + "mcp-" + randomUUID().slice(0, 8) + "-" + name.replace(/[^A-Za-z0-9._-]/g, "_");
          const block = IMAGE_TYPES.has(type) ? imageBlockMarkdown(ref) : fileBlockMarkdown(ref, name);
          const text = caption?.trim() ? block + "\n\n" + caption.trim() : block;
          const spot = findFreeSpot(noteBoxes(doc), TEXT_NOTE_SIZE, TEXT_NOTE_SIZE);
          const now = Date.now();
          const id = newId("mcp");
          const map = new Y.Map<unknown>();
          for (const [field, value] of Object.entries({
            id, boardId: board, kind: "text", x: spot.x, y: spot.y, width: TEXT_NOTE_SIZE, height: TEXT_NOTE_SIZE,
            rotation: 0, content: text, aiOptOut: false, createdAt: now, updatedAt: now,
          })) {
            map.set(field, value);
          }
          stamp(map, context, now);
          doc.getMap<unknown>(FILES_MAP).set(ref, stored.id);
          doc.getMap<Y.Map<unknown>>(NOTES_MAP).set(id, map);
          return "파일을 올리고 메모로 붙였어요: [" + id + "] · " + name + " (" + stored.size + "바이트) · 위치 " + where(spot.x, spot.y);
        });
      } catch (error) {
        await discardUpload(context, board, stored.id);
        throw error;
      }
    });
  },
});

export const writeTools: readonly McpTool[] = [
  createNoteTool,
  updateNoteTool,
  deleteNoteTool,
  createConnectionTool,
  deleteConnectionTool,
  uploadAttachmentTool,
];
