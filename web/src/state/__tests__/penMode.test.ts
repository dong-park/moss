import { beforeEach, describe, expect, it } from "vitest";
import {
  useWorkspace,
  __internal,
  PEN_MAX_WIDTH,
  PEN_DEFAULT_WIDTH,
  type Card,
} from "@/state/workspace";
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
    penMode: false,
    penTool: "pen",
    penWidth: PEN_DEFAULT_WIDTH,
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

  it("comment 인코딩 text는 건드리지 않고 comment로 환원", () => {
    const content = JSON.stringify({
      __moss_comment_v1__: true,
      author: "동박",
      time: "2 days ago",
      body: "오호",
    });
    const card = decodeNoteToCard(makeNote({ id: "cm", content }));
    expect(card.kind).toBe("comment");
    expect(card.content).toBe("오호");
    expect(card.author).toBe("동박");
  });
});

describe("펜 모드 액션", () => {
  it("setPenMode(true)는 편집을 닫는다 (상호배타)", () => {
    useWorkspace.setState({ editingId: "x" });
    useWorkspace.getState().setPenMode(true);
    expect(useWorkspace.getState().penMode).toBe(true);
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("setPenMode(false)는 편집을 건드리지 않는다", () => {
    useWorkspace.setState({ editingId: "x", penMode: true });
    useWorkspace.getState().setPenMode(false);
    expect(useWorkspace.getState().penMode).toBe(false);
    expect(useWorkspace.getState().editingId).toBe("x");
  });

  it("togglePenMode 토글", () => {
    const { togglePenMode } = useWorkspace.getState();
    togglePenMode();
    expect(useWorkspace.getState().penMode).toBe(true);
    togglePenMode();
    expect(useWorkspace.getState().penMode).toBe(false);
  });

  it("setPenWidth는 한계로 클램프", () => {
    useWorkspace.getState().setPenWidth(999);
    expect(useWorkspace.getState().penWidth).toBe(PEN_MAX_WIDTH);
  });

  it("setPenTool", () => {
    useWorkspace.getState().setPenTool("eraser");
    expect(useWorkspace.getState().penTool).toBe("eraser");
  });
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

describe("펜 모드 undo/redo/clear (D3 — AC-7)", () => {
  const makeCard = (id: string): Card => ({
    id,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    content: "",
  });
  const ov = (n: number) => JSON.stringify({ paths: [[{ x: n, y: n }]] });
  const overlayOf = (id: string) =>
    useWorkspace.getState().cards.find((c) => c.id === id)?.overlay;

  beforeEach(() => {
    useWorkspace.setState({
      cards: [makeCard("c1"), makeCard("c2")],
      penMode: true,
      penUndoStack: [],
      penRedoStack: [],
      lastPenCardId: null,
    });
  });

  it("setOverlay는 변경 직전 값을 undo 스택에 쌓고 lastPenCardId를 기록한다", () => {
    useWorkspace.getState().setOverlay("c1", ov(1));
    expect(useWorkspace.getState().penUndoStack).toEqual([
      { cardId: "c1", overlay: "" },
    ]);
    expect(useWorkspace.getState().lastPenCardId).toBe("c1");
  });

  it("penUndo는 한 획씩 직전 overlay로 되돌린다", () => {
    const s = useWorkspace.getState();
    s.setOverlay("c1", ov(1));
    s.setOverlay("c1", ov(2));
    useWorkspace.getState().penUndo();
    expect(overlayOf("c1")).toBe(ov(1));
    useWorkspace.getState().penUndo();
    expect(overlayOf("c1")).toBe("");
  });

  it("undo/redo는 전역 cross-card 스택 — 카드 불문 마지막 획을 되돌린다", () => {
    const s = useWorkspace.getState();
    s.setOverlay("c1", ov(1));
    s.setOverlay("c2", ov(2));
    useWorkspace.getState().penUndo(); // 마지막 = c2
    expect(overlayOf("c2")).toBe("");
    expect(overlayOf("c1")).toBe(ov(1));
    useWorkspace.getState().penRedo();
    expect(overlayOf("c2")).toBe(ov(2));
  });

  it("새 setOverlay는 redo 스택을 무효화한다", () => {
    useWorkspace.getState().setOverlay("c1", ov(1));
    useWorkspace.getState().penUndo();
    expect(useWorkspace.getState().penRedoStack.length).toBe(1);
    useWorkspace.getState().setOverlay("c1", ov(3));
    expect(useWorkspace.getState().penRedoStack.length).toBe(0);
  });

  it("penClear는 마지막 그린 카드를 비우고, undo로 복원된다", () => {
    useWorkspace.getState().setOverlay("c1", ov(1));
    useWorkspace.getState().penClear();
    expect(overlayOf("c1")).toBe("");
    useWorkspace.getState().penUndo();
    expect(overlayOf("c1")).toBe(ov(1));
  });

  it("빈 스택 penUndo/penRedo, 빈 카드 penClear는 no-op", () => {
    useWorkspace.setState({ penUndoStack: [], penRedoStack: [] });
    expect(() => {
      useWorkspace.getState().penUndo();
      useWorkspace.getState().penRedo();
      useWorkspace.getState().penClear();
    }).not.toThrow();
  });

  it("setPenMode(false)는 undo/redo 히스토리를 비운다 (세션 단위)", () => {
    useWorkspace.getState().setOverlay("c1", ov(1));
    useWorkspace.getState().setPenMode(false);
    expect(useWorkspace.getState().penUndoStack).toEqual([]);
    expect(useWorkspace.getState().penRedoStack).toEqual([]);
    expect(useWorkspace.getState().lastPenCardId).toBeNull();
  });
});
