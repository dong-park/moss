/**
 * FEAT-collab-auth n1 — schema.ts 행 타입 ↔ Y.Map 손실 없는 왕복.
 *
 * Yjs는 문서에 통합되지 않은 Y.Map을 읽지 못하므로, 변환 함수가 만든
 * Y.Map을 문서에 붙인 뒤 읽는다.
 */
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import type { Board, Connection, Note } from "@/state/db/schema";
import {
  boardToYMap,
  connectionToYMap,
  connectionsMap,
  notesMap,
  noteToYMap,
  putBoard,
  putConnection,
  putNote,
  readBoard,
  readConnections,
  readNote,
  readNotes,
  yMapToBoard,
  yMapToConnection,
  yMapToNote,
  updateNoteField,
} from "@/state/ydoc/model";
import { toSharedBoard, toSharedNote } from "@/state/ydoc/model";

const now = 1_700_000_000_000;

function fullNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "n-1",
    boardId: "b-1",
    kind: "text",
    x: 12.5,
    y: -7,
    width: 240,
    height: 96,
    rotation: 0.25,
    content: "# 제목\n본문",
    attachmentRef: "opfs:a.png",
    mediaType: "image/png",
    color: "#ff0000",
    overlay: '{"paths":[]}',
    frameId: "frame-1",
    title: "메모 제목",
    aiOptOut: true,
    createdAt: now,
    updatedAt: now + 1,
    lastVisitedAt: now + 2,
    ...overrides,
  };
}

describe("Y.Map ↔ 행 타입 변환", () => {
  it("Note 전체 필드가 왕복한다", () => {
    const note = fullNote();
    const doc = new Y.Doc();
    const map = noteToYMap(note);
    notesMap(doc).set(note.id, map);

    const got = yMapToNote(map);
    expect(got).toEqual(toSharedNote(note));
    expect(got.overlay).toBe(note.overlay);
    expect(got.frameId).toBe("frame-1");
    expect(got.mediaType).toBe("image/png");
  });

  it("Note 선택 필드가 없으면 키도 없다", () => {
    const note = fullNote({
      boardId: null,
      height: undefined,
      attachmentRef: undefined,
      mediaType: undefined,
      color: undefined,
      overlay: undefined,
      frameId: undefined,
      title: undefined,
    });
    const doc = new Y.Doc();
    const map = noteToYMap(note);
    notesMap(doc).set(note.id, map);

    expect(map.has("height")).toBe(false);
    expect(map.has("overlay")).toBe(false);
    const got = yMapToNote(map);
    expect(got).toEqual(toSharedNote(note));
    expect(got.height).toBeUndefined();
  });

  it("Connection 전체 필드가 왕복한다", () => {
    const conn: Connection = {
      id: "c-1",
      sourceNoteId: "n-1",
      targetNoteId: "n-2",
      source: "ai-suggested",
      status: "pending",
      label: "관련",
      createdAt: now,
    };
    const doc = new Y.Doc();
    const map = connectionToYMap(conn);
    connectionsMap(doc).set(conn.id, map);
    expect(yMapToConnection(map)).toEqual(conn);
  });

  it("Connection은 label이 없으면 키도 없다", () => {
    const conn: Connection = {
      id: "c-2",
      sourceNoteId: "n-1",
      targetNoteId: "n-2",
      source: "manual",
      status: "active",
      createdAt: now,
    };
    const doc = new Y.Doc();
    const map = connectionToYMap(conn);
    connectionsMap(doc).set(conn.id, map);
    expect(map.has("label")).toBe(false);
    expect(yMapToConnection(map)).toEqual(conn);
  });

  it("Board 전체 필드가 왕복한다", () => {
    const board: Board = {
      id: "b-1",
      name: "보드 이름",
      isSystem: true,
      templateId: "t-1",
      parentBoardId: "b-root",
      createdAt: now,
      updatedAt: now + 1,
      lastOpenedAt: now + 2,
    };
    const doc = new Y.Doc();
    const map = boardToYMap(board);
    doc.getMap<Y.Map<unknown>>("holder").set(board.id, map);
    expect(yMapToBoard(map)).toEqual(toSharedBoard(board));
  });

  it("Board는 parentBoardId·templateId가 없으면 키도 없다", () => {
    const board: Board = {
      id: "b-1",
      name: "",
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    const doc = new Y.Doc();
    const map = boardToYMap(board);
    doc.getMap<Y.Map<unknown>>("holder").set(board.id, map);
    expect(map.has("parentBoardId")).toBe(false);
    expect(map.has("templateId")).toBe(false);
    expect(yMapToBoard(map)).toEqual(toSharedBoard(board));
  });
});

describe("Y.Doc 쓰기·읽기", () => {
  it("putNote·putConnection·putBoard 뒤 read*가 같은 값을 돌려준다", () => {
    const doc = new Y.Doc();
    const note = fullNote();
    const conn: Connection = {
      id: "c-1",
      sourceNoteId: "n-1",
      targetNoteId: "n-2",
      source: "manual",
      status: "active",
      createdAt: now,
    };
    const board: Board = {
      id: "b-1",
      name: "이름",
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };

    putNote(doc, note);
    putConnection(doc, conn);
    putBoard(doc, board);

    expect(readNote(doc, note.id)).toEqual(toSharedNote(note));
    expect(readNotes(doc)).toEqual([toSharedNote(note)]);
    expect(readConnections(doc)).toEqual([conn]);
    expect(readBoard(doc)).toEqual(toSharedBoard(board));
  });

  it("메모 필드 하나를 바꾸면 그 Y.Map 키 하나만 변경된다", () => {
    const doc = new Y.Doc();
    const note = fullNote();
    putNote(doc, note);

    const map = notesMap(doc).get(note.id)!;
    const changed: string[][] = [];
    map.observe((event) => changed.push([...event.keysChanged]));

    updateNoteField(doc, note.id, "x", 999);

    expect(changed).toEqual([["x"]]);
    expect(readNote(doc, note.id)?.x).toBe(999);
    expect(readNote(doc, note.id)?.y).toBe(note.y);
  });

  it("리뷰 반영: 같은 값을 다시 써도 Y.Map 업데이트가 없다", () => {
    const doc = new Y.Doc();
    const note = fullNote();
    putNote(doc, note);
    let updates = 0;
    doc.on("update", () => updates++);
    putNote(doc, note);
    updateNoteField(doc, note.id, "x", note.x);
    expect(updates).toBe(0);
  });

  it("리뷰 반영: 없는 메모에 updateNoteField는 아무것도 만들지 않는다", () => {
    const doc = new Y.Doc();
    updateNoteField(doc, "ghost", "x", 10);
    expect(notesMap(doc).has("ghost")).toBe(false);
    expect(readNotes(doc)).toEqual([]);
  });

  it("리뷰 반영: 기기 로컬 필드는 문서에 쓰지 않는다", () => {
    const doc = new Y.Doc();
    const note = fullNote();
    putNote(doc, note);
    expect(notesMap(doc).get(note.id)!.has("lastVisitedAt")).toBe(false);
  });

  it("리뷰 반영: 비원시 값과 id 없는 항목은 읽기에서 걸러진다", () => {
    const doc = new Y.Doc();
    const note = fullNote();
    putNote(doc, note);
    const map = notesMap(doc).get(note.id)!;
    map.set("content", new Y.Map());
    notesMap(doc).set("broken", new Y.Map());
    (notesMap(doc) as unknown as Y.Map<unknown>).set("junk", 1);
    const got = readNotes(doc);
    notesMap(doc).set("partial", new Y.Map([["id", "partial"]]) as Y.Map<unknown>);
    expect(got).toHaveLength(1);
    expect(readNotes(doc).map((n) => n.id)).toEqual([note.id]);
    expect(got[0].content).toBeUndefined();
  });
});
