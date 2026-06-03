import { describe, expect, it } from "vitest";
import { __internal } from "@/state/workspace";
import { serializeBlocks, serializeCode, serializeHandwriting } from "@/state/cardContent";
import type { Note } from "@/state/db/schema";

/** FEAT-card-allinone AC-6 — 레거시 code·handwriting 노트를 글 카드 단일 블록으로 무손실 환원. */

function note(kind: Note["kind"], content: string): Note {
  return {
    id: "n",
    boardId: null,
    kind,
    x: 10,
    y: 20,
    width: 260,
    rotation: 0,
    content,
    aiOptOut: false,
    createdAt: 0,
    updatedAt: 0,
    lastVisitedAt: 0,
  };
}

describe("decodeNoteToCard · 올인원 마이그레이션", () => {
  it("code 노트 → text 카드 + 단일 code 블록 (code/lang 보존)", () => {
    const n = note("code", serializeCode({ code: "const x = 1", lang: "ts" }));
    const card = __internal.decodeNoteToCard(n);

    expect(card.kind).toBe("text");
    expect(card.content).toBe(
      serializeBlocks([{ type: "code", code: "const x = 1", lang: "ts" }]),
    );
    // 위치 등 메타는 유지.
    expect(card.x).toBe(10);
    expect(card.width).toBe(260);
  });

  it("lang 없는 code 노트도 손실 없이 환원", () => {
    const n = note("code", serializeCode({ code: "x=1" }));
    const card = __internal.decodeNoteToCard(n);
    expect(card.content).toBe(serializeBlocks([{ type: "code", code: "x=1" }]));
  });

  it("handwriting 노트 → text 카드 + 단일 handwriting 블록 (획 좌표 보존)", () => {
    const paths = [[{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 6, y: 6 }, { x: 9, y: 9 }]];
    const n = note("handwriting", serializeHandwriting({ paths }));
    const card = __internal.decodeNoteToCard(n);

    expect(card.kind).toBe("text");
    expect(card.content).toBe(serializeBlocks([{ type: "handwriting", paths }]));
  });

  it("일반 text 노트는 그대로 (마이그레이션 대상 아님)", () => {
    const card = __internal.decodeNoteToCard(note("text", "그냥 메모"));
    expect(card.kind).toBe("text");
    expect(card.content).toBe("그냥 메모");
  });
});
