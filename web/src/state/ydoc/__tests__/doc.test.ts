/**
 * FEAT-collab-auth n1 — openBoardDoc 로컬 저장 (fake-indexeddb 실경로).
 * y-indexeddb를 stub하지 않고 실제 IndexeddbPersistence를 탄다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clearDocument } from "y-indexeddb";
import type { Board, Connection, Note } from "@/state/db/schema";
import { boardDocName, openBoardDoc, type BoardDocHandle } from "@/state/ydoc/doc";
import { putBoard, putConnection, putNote, readBoard, readConnections, readNotes } from "@/state/ydoc/model";
import { toSharedBoard, toSharedNote } from "@/state/ydoc/model";

let counter = 0;
const ids: string[] = [];

function nextBoardId(): string {
  const id = `b-${Date.now()}-${counter++}`;
  ids.push(id);
  return id;
}

afterEach(async () => {
  while (ids.length) {
    await clearDocument(boardDocName(ids.pop()!));
  }
});

const now = 1_700_000_000_000;

function makeNote(id: string): Note {
  return {
    id,
    boardId: null,
    kind: "text",
    x: 3,
    y: 4,
    width: 240,
    height: 80,
    rotation: 0,
    content: "본문",
    title: "제목",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
  };
}

describe("openBoardDoc", () => {
  it("쓰고 닫고 다시 열면 같은 값이 나온다", async () => {
    const boardId = nextBoardId();
    const note = makeNote("n-1");
    const conn: Connection = {
      id: "c-1",
      sourceNoteId: "n-1",
      targetNoteId: "n-2",
      source: "manual",
      status: "active",
      createdAt: now,
    };
    const board: Board = {
      id: boardId,
      name: "공유 보드",
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };

    const first: BoardDocHandle = openBoardDoc(boardId);
    expect(first.persistence.name).toBe(`moss-board-${boardId}`);
    await first.whenLoaded;
    putBoard(first.doc, board);
    putNote(first.doc, note);
    putConnection(first.doc, conn);
    await first.destroy();

    const second = openBoardDoc(boardId);
    await second.whenLoaded;
    expect(readBoard(second.doc)).toEqual(toSharedBoard(board));
    expect(readNotes(second.doc)).toEqual([toSharedNote(note)]);
    expect(readConnections(second.doc)).toEqual([conn]);
    await second.destroy();
  });

  it("다른 보드 id는 다른 저장소를 쓴다", async () => {
    const a = nextBoardId();
    const b = nextBoardId();
    const ha = openBoardDoc(a);
    await ha.whenLoaded;
    putNote(ha.doc, makeNote("only-a"));
    await ha.destroy();

    const hb = openBoardDoc(b);
    await hb.whenLoaded;
    expect(readNotes(hb.doc)).toEqual([]);
    await hb.destroy();
  });
});
