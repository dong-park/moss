import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useShortcuts } from "@/components/workspace/useShortcuts";
import { useWorkspace, CAPTURE_TOOLS, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;

function Mount() {
  useShortcuts();
  return null;
}

beforeEach(() => {
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
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    pendingAIGate: null,
    lastToolId: "text",
    textPlacementArmed: false,
    expandedCardId: null,
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("FEAT-capture AC-1: 글로벌 단축키", () => {
  it("Cmd+Shift+N → lastToolId로 카드 추가", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    // FEAT-sticky-redesign: CaptureToolId가 "text" 하나로 줄어 lastToolId도 항상 "text".
    useWorkspace.setState({ lastToolId: "text" });

    render(<Mount />);

    const before = useWorkspace.getState().cards.length;
    fireEvent.keyDown(window, {
      key: "N",
      code: "KeyN",
      metaKey: true,
      shiftKey: true,
    });
    await new Promise((r) => setTimeout(r, 10));

    const after = useWorkspace.getState().cards;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].kind).toBe("text");
  });

  it("Cmd+1 → CAPTURE_TOOLS[0] (text) 카드 추가", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    render(<Mount />);
    const before = useWorkspace.getState().cards.length;
    fireEvent.keyDown(window, { key: "1", code: "Digit1", metaKey: true });
    await new Promise((r) => setTimeout(r, 10));
    const after = useWorkspace.getState().cards;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].kind).toBe(CAPTURE_TOOLS[0]);
  });

  it("Cmd+2 → CAPTURE_TOOLS 범위 밖이라 no-op (FEAT-sticky-redesign: 캡처 1종)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    render(<Mount />);
    const before = useWorkspace.getState().cards.length;
    fireEvent.keyDown(window, { key: "2", code: "Digit2", metaKey: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(useWorkspace.getState().cards.length).toBe(before);
  });

  it("Cmd+1~Cmd+N → 각 카드 종류 매핑 (N=CAPTURE_TOOLS.length)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<Mount />);

    for (let i = 1; i <= CAPTURE_TOOLS.length; i++) {
      fireEvent.keyDown(window, {
        key: String(i),
        code: `Digit${i}`,
        metaKey: true,
      });
      await new Promise((r) => setTimeout(r, 5));
      const cards = useWorkspace.getState().cards;
      expect(cards[cards.length - 1].kind).toBe(CAPTURE_TOOLS[i - 1]);
    }
  });

  it("addCardAt 호출 시 lastToolId 자동 갱신 (Cmd+1 후 Cmd+Shift+N → 동일 도구)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<Mount />);

    fireEvent.keyDown(window, { key: "1", code: "Digit1", metaKey: true });
    await new Promise((r) => setTimeout(r, 5));
    const tool = CAPTURE_TOOLS[0]; // index 1-1 = 0 → "text"
    expect(useWorkspace.getState().lastToolId).toBe(tool);

    fireEvent.keyDown(window, {
      key: "N",
      code: "KeyN",
      metaKey: true,
      shiftKey: true,
    });
    await new Promise((r) => setTimeout(r, 5));
    const cards = useWorkspace.getState().cards;
    expect(cards[cards.length - 1].kind).toBe(tool);
  });

  it("입력 중(input focus) Cmd+숫자는 무시", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const { container } = render(
      <>
        <Mount />
        <input data-testid="typing" />
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    const before = useWorkspace.getState().cards.length;
    fireEvent.keyDown(window, { key: "2", code: "Digit2", metaKey: true });
    await new Promise((r) => setTimeout(r, 5));
    expect(useWorkspace.getState().cards.length).toBe(before);
  });

  it("modifier 없이 단순 N키는 무시", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<Mount />);
    const before = useWorkspace.getState().cards.length;
    fireEvent.keyDown(window, { key: "N", code: "KeyN" });
    await new Promise((r) => setTimeout(r, 5));
    expect(useWorkspace.getState().cards.length).toBe(before);
  });
});

describe("FEAT-text-tool AC-2: T 배치 모드 단축키", () => {
  it("T → 배치 모드 켜짐, Esc → 꺼짐", () => {
    render(<Mount />);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(true);

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
  });

  it("입력 포커스 중 T는 무시 (DOD)", () => {
    const { container } = render(
      <>
        <Mount />
        <input data-testid="typing" />
      </>,
    );
    (container.querySelector("input") as HTMLInputElement).focus();
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
  });

  it("펜 모드 중 T는 무시", () => {
    useWorkspace.setState({ penMode: true });
    render(<Mount />);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
    useWorkspace.setState({ penMode: false });
  });

  it("선택된 메모가 있으면 T를 제목 편집에 양보한다 (P1-2)", () => {
    const card: Card = { id: "A", kind: "text", x: 0, y: 0, width: 240, content: "" };
    useWorkspace.setState({ cards: [card], selectedIds: ["A"], editingId: null });
    render(<Mount />);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
  });

  it("확대 모달이 열려 있으면 T는 무시 (P1-2)", () => {
    useWorkspace.setState({ expandedCardId: "A" });
    render(<Mount />);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(false);
  });

  it("선택이 textbox면 제목 대상이 아니라 T가 배치 모드를 켠다", () => {
    const card: Card = { id: "tb", kind: "textbox", x: 0, y: 0, width: 120, content: "" };
    useWorkspace.setState({ cards: [card], selectedIds: ["tb"], editingId: null });
    render(<Mount />);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(useWorkspace.getState().textPlacementArmed).toBe(true);
  });
});
