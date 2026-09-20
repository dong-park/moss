import { describe, expect, it } from "vitest";
import type { Note } from "@/state/db/schema";
import { encodeFrameContent } from "@/state/frameContent";
import {
  buildMarkdownExportContext,
  noteToMarkdown,
} from "../markdownExport";

function makeNote(partial: Partial<Note> & Pick<Note, "id">): Note {
  const now = Date.now();
  return {
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "body",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
    ...partial,
  };
}

describe("Markdown frontmatter (spec §10)", () => {
  it("제목 있는 메모 — frontmatter에 title", () => {
    const note = makeNote({ id: "n1", title: "브랜드" });
    const ctx = buildMarkdownExportContext([note], []);
    const { content } = noteToMarkdown(note, ctx);
    expect(content).toContain("title: 브랜드");
    expect(content).not.toMatch(/^#\s/m);
  });

  it("제목 없는 메모 — title 칸 없음", () => {
    const note = makeNote({ id: "n2" });
    const ctx = buildMarkdownExportContext([note], []);
    const { content } = noteToMarkdown(note, ctx);
    expect(content).not.toContain("title:");
  });

  it("frame·hasOverlay frontmatter", () => {
    const frame = makeNote({
      id: "f1",
      kind: "frame",
      height: 200,
      content: encodeFrameContent("판"),
    });
    const note = makeNote({
      id: "n3",
      frameId: "f1",
      overlay: "{}",
      boardId: "b1",
    });
    const boards = [
      {
        id: "b1",
        name: "Brand",
        isSystem: false,
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1,
      },
    ];
    const ctx = buildMarkdownExportContext([frame, note], boards);
    const { content } = noteToMarkdown(note, ctx);
    expect(content).toContain("frame: 판");
    expect(content).toContain("hasOverlay: true");
  });
});
