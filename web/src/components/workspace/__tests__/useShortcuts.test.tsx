import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useShortcuts } from "@/components/workspace/useShortcuts";
import { useWorkspace, CAPTURE_TOOLS } from "@/state/workspace";
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
