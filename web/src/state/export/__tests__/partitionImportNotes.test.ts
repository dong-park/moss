import { describe, expect, it } from "vitest";
import type { Note } from "@/state/db/schema";
import { partitionImportNotes } from "../partitionImportNotes";

function makeNote(partial: Partial<Note> & Pick<Note, "id" | "kind">): Note {
  const now = Date.now();
  return {
    boardId: null,
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...partial,
  };
}

describe("partitionImportNotes", () => {
  it("옛 종류 9가지는 skipped", () => {
    const legacy = [
      "image",
      "link",
      "audio",
      "file",
      "mindmap",
      "handwriting",
      "highlight",
      "checklist",
      "code",
    ] as const;
    const rows = legacy.map((kind, i) =>
      makeNote({ id: `n-${i}`, kind, content: "x" }),
    );
    const { accepted, skipped } = partitionImportNotes(rows);
    expect(accepted).toHaveLength(0);
    expect(skipped).toHaveLength(9);
    for (const kind of legacy) {
      expect(skipped.filter((s) => s.kind === kind)).toHaveLength(1);
    }
  });

  it("text·board·frame은 accepted", () => {
    const text = makeNote({ id: "t1", kind: "text", content: "hello" });
    const board = makeNote({
      id: "b1",
      kind: "board",
      content: '{"__moss_subcanvas_v1__":true,"boardRef":"sub"}',
    });
    const frame = makeNote({
      id: "f1",
      kind: "frame",
      content: '{"name":"판"}',
      height: 160,
    });
    const { accepted, skipped } = partitionImportNotes([
      text,
      board,
      frame,
    ]);
    expect(skipped).toHaveLength(0);
    expect(accepted).toHaveLength(3);
  });
});
