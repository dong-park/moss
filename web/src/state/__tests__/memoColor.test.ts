import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB, type Note } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { buildJsonCanvas } from "@/state/export/jsonCanvasExport";
import { MEMO_COLORS, MEMO_TINTS, memoTint } from "@/components/workspace/memoVariety";

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({ cards: [], selectedIds: [] });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

function push(id: string, kind: Card["kind"], color?: string): void {
  const card: Card = { id, kind, x: 0, y: 0, width: 100, height: 100, content: "", ...(color ? { color } : {}) };
  useWorkspace.setState((s) => ({ cards: [...s.cards, card] }));
}
const colorOf = (id: string) => useWorkspace.getState().cards.find((c) => c.id === id)?.color;

describe("memoTint", () => {
  it("고른 색은 단색, 없거나 모르는 값은 id 해시 노랑", () => {
    expect(memoTint("m1", "blue")).toBe(MEMO_COLORS.blue);
    expect(MEMO_TINTS).toContain(memoTint("m1"));
    expect(memoTint("m1", "#ff0000")).toBe(memoTint("m1"));
  });
});

describe("setMemoColor", () => {
  it("선택한 메모 전부를 바꾸고 메모가 아닌 카드는 건드리지 않는다", () => {
    push("m1", "text");
    push("m2", "text");
    push("tb", "textbox", "#334155");
    useWorkspace.getState().setMemoColor(["m1", "m2", "tb"], "lime");
    expect(colorOf("m1")).toBe("lime");
    expect(colorOf("m2")).toBe("lime");
    expect(colorOf("tb")).toBe("#334155");
  });

  it("null이면 저장된 색을 지워 기본 노랑으로 돌아간다", () => {
    push("m1", "text", "pink");
    useWorkspace.getState().setMemoColor(["m1"], null);
    const card = useWorkspace.getState().cards.find((c) => c.id === "m1");
    expect(card && "color" in card).toBe(false);
  });

  it("이미 그 색이면 카드 객체를 바꾸지 않는다", () => {
    push("m1", "text", "blue");
    const before = useWorkspace.getState().cards[0];
    useWorkspace.getState().setMemoColor(["m1"], "blue");
    expect(useWorkspace.getState().cards[0]).toBe(before);
  });
});

describe("JSON Canvas 내보내기", () => {
  const note = (over: Partial<Note>): Note => ({
    id: "m1", boardId: null, kind: "text", x: 0, y: 0, width: 100, rotation: 0, content: "",
    aiOptOut: true, createdAt: 1, updatedAt: 1, lastVisitedAt: 1, ...over,
  });
  it("고른 메모 색만 hex로 싣고 기본 노랑은 싣지 않는다", () => {
    const doc = buildJsonCanvas([note({ color: "purple" }), note({ id: "m2" })], []);
    expect(doc.nodes[0].color).toBe(MEMO_COLORS.purple);
    expect(doc.nodes[1].color).toBeUndefined();
  });
});
