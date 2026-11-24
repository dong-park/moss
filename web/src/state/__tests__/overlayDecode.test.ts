import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, __internal, type Card } from "@/state/workspace";
import type { Note } from "@/state/db/schema";
import { serializeBlocks, serializeChecklist, serializeCode } from "@/state/cardContent";

const { decodeNoteToCard } = __internal;

function makeNote(patch: Partial<Note> & { id: string }): Note {
  return {
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: 0,
    updatedAt: 0,
    lastVisitedAt: 0,
    ...patch,
  };
}

beforeEach(() => {
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    heldTool: null,
  });
});

describe("decodeNoteToCard — overlay 매핑", () => {
  it("overlay 필드를 카드로 왕복", () => {
    const overlay = JSON.stringify({ paths: [[{ x: 1, y: 2 }]] });
    const card = decodeNoteToCard(makeNote({ id: "n1", overlay }));
    expect(card.overlay).toBe(overlay);
  });

  it("overlay 없으면 undefined", () => {
    const card = decodeNoteToCard(makeNote({ id: "n2" }));
    expect(card.overlay).toBeUndefined();
  });
});

describe("decodeNoteToCard — 방어적 마이그레이션", () => {
  it("code 노트 → text + 단일 code 블록 (code/lang 보존)", () => {
    const note = makeNote({
      id: "c1",
      kind: "code",
      content: serializeCode({ code: "const x = 1", lang: "js" }),
    });
    const card = decodeNoteToCard(note);
    expect(card.kind).toBe("text");
    expect(card.content).toBe(
      serializeBlocks([{ type: "code", code: "const x = 1", lang: "js" }]),
    );
  });

  it("checklist 노트 → text + text 블록 (GFM 마크다운 보존)", () => {
    const note = makeNote({
      id: "c2",
      kind: "checklist",
      content: serializeChecklist([{ id: "1", text: "할 일", done: false }]),
    });
    const card = decodeNoteToCard(note);
    expect(card.kind).toBe("text");
    expect(card.content).toBe(serializeBlocks([{ type: "text", text: "- [ ] 할 일" }]));
  });

  // comment 종류 삭제(2026-09-22) — 옛 마커 JSON이 text로 남는 것은
  // workspace.test.ts "옛 comment 마커 JSON도 그대로 text로 유지"가 지킨다.
});

describe("setOverlay", () => {
  it("overlay만 갱신하고 content는 불변", () => {
    const card: Card = {
      id: "o1",
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      content: "메모 본문",
    };
    useWorkspace.setState({ cards: [card] });
    const overlay = JSON.stringify({ paths: [[{ x: 5, y: 5 }]] });
    useWorkspace.getState().setOverlay("o1", overlay);
    const updated = useWorkspace.getState().cards.find((c) => c.id === "o1");
    expect(updated?.overlay).toBe(overlay);
    expect(updated?.content).toBe("메모 본문");
  });
});
