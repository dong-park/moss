import { beforeEach, describe, expect, it } from "vitest";
import {
  useWorkspace,
  __internal,
  PEN_MAX_WIDTH,
  PEN_DEFAULT_WIDTH,
  type Card,
} from "@/state/workspace";
import type { Note } from "@/state/db/schema";
import { serializeChecklist, serializeCode } from "@/state/cardContent";

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
  it("code 노트 → text + 마크다운 코드블록", () => {
    const note = makeNote({
      id: "c1",
      kind: "code",
      content: serializeCode({ code: "const x = 1", lang: "js" }),
    });
    const card = decodeNoteToCard(note);
    expect(card.kind).toBe("text");
    expect(card.content).toBe("```js\nconst x = 1\n```");
  });

  it("checklist 노트 → text + GFM 작업목록", () => {
    const note = makeNote({
      id: "c2",
      kind: "checklist",
      content: serializeChecklist([{ id: "1", text: "할 일", done: false }]),
    });
    const card = decodeNoteToCard(note);
    expect(card.kind).toBe("text");
    expect(card.content).toBe("- [ ] 할 일");
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
