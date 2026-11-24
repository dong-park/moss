import { describe, expect, it } from "vitest";
import { __internal, aspectForKind } from "@/state/workspace";
import type { Note } from "@/state/db/schema";

const { decodeNoteToCard } = __internal;

// 옛 첫 실행 시드가 높이 없이 저장하던 모양 — 이미 사용자 저장소에 남아 있다.
const LEGACY_FLAT_NOTES = [
  { id: "seed-todo", kind: "text", width: 460, height: undefined },
  { id: "seed-preview", kind: "text", width: 130, height: undefined },
  { id: "seed-empty", kind: "text", width: 280, height: undefined },
] as const;

function note(over: Partial<Note>): Note {
  return {
    id: "n", boardId: null, kind: "text", x: 0, y: 0, width: 280, rotation: 0,
    content: "", aiOptOut: false, createdAt: 0, updatedAt: 0, lastVisitedAt: 0, ...over,
  };
}

// 앞면이 제목만 겹쳐 그려 높이 없는 메모는 띠처럼 납작해진다 — 어디서 오든 높이를 채운다.
describe("납작 메모 차단", () => {
  it("높이 없이 저장된 메모를 불러오면 폭과 종이 비율로 높이를 채운다", () => {
    const card = decodeNoteToCard(note({ height: undefined }));
    expect(card.height).toBeCloseTo(280 / aspectForKind("text"));
  });

  it("직사각으로 저장된 메모도 정사각형으로 불러온다", () => {
    expect(decodeNoteToCard(note({ height: 123 })).height).toBe(280);
  });

  it("메모가 아닌 카드는 건드리지 않는다", () => {
    expect(decodeNoteToCard(note({ kind: "frame", width: 320, height: undefined, content: "{\"name\":\"판\"}" })).height).toBeUndefined();
  });

  it("옛 시드처럼 높이 없는 메모가 저장소에 남아 있어도 불러오기 경로가 채운다", () => {
    for (const c of LEGACY_FLAT_NOTES) {
      expect(decodeNoteToCard(note({ width: c.width, height: undefined })).height).toBeGreaterThan(0);
    }
  });
});
