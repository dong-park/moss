import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useCardFlowShortcuts } from "@/components/workspace/useCardFlowShortcuts";
import { useShortcuts } from "@/components/workspace/useShortcuts";
import {
  SYSTEM_BOARD_ID,
  useWorkspace,
  type Card,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

/**
 * FEAT-card-flow §10 DOD — Hook 통합 테스트.
 * AC-4: Cmd+E 단축키 dispatch 시 editingId 갱신
 * AC-5: textarea Enter (no modifier) → 줄바꿈 (카드 생성 안 됨)
 * AC-6: useShortcuts 회귀 — Cmd+1로 카드 생성 정상 (본 hook과 공존)
 * +Tab/Shift+Tab/Cmd+Enter 단축키 dispatch 흐름
 */

let originalStorage: PropertyDescriptor | undefined;

function Mount() {
  useCardFlowShortcuts();
  return null;
}

/** AC-6 검증용 — useShortcuts와 함께 마운트되어도 회귀가 없어야 한다. */
function MountBoth() {
  useShortcuts();
  useCardFlowShortcuts();
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
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    templatePickerOpen: false,
    viewport: { x: 0, y: 0, scale: 1 },
    lastToolId: "text",
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function makeCard(over: Partial<Card>): Card {
  return {
    id: over.id ?? "c-1",
    kind: over.kind ?? "text",
    x: over.x ?? 0,
    y: over.y ?? 0,
    width: over.width ?? 240,
    height: over.height,
    content: over.content ?? "",
    ...over,
  };
}

describe("FEAT-card-flow · useCardFlowShortcuts", () => {
  it("AC-4: Cmd+E → 선택된 캡처 카드의 editingId 세팅", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text" })],
      selectedIds: ["A"],
      editingId: null,
    });
    render(<Mount />);

    fireEvent.keyDown(window, { key: "e", code: "KeyE", metaKey: true });
    expect(useWorkspace.getState().editingId).toBe("A");
  });

  /* 2026-09-22 사용자 결정: 누르기는 선택, 치기 시작하면 제목 편집. */
  it("글자 키 → 고른 메모의 제목 편집으로 들어가고 그 글자가 첫 글자가 된다", () => {
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text" })],
      selectedIds: ["A"],
      editingId: null,
    });
    render(<Mount />);

    fireEvent.keyDown(window, { key: "회" });
    expect(useWorkspace.getState().editingId).toBe("A");
    expect(useWorkspace.getState().cards.find((c) => c.id === "A")?.title).toBe("회");
  });

  it("기존 제목은 지우지 않고 뒤에 붙인다", () => {
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text", title: "회의" })],
      selectedIds: ["A"],
      editingId: null,
    });
    render(<Mount />);

    fireEvent.keyDown(window, { key: "록" });
    expect(useWorkspace.getState().cards.find((c) => c.id === "A")?.title).toBe("회의록");
  });

  it("Space는 캔버스 이동용이라 제목 편집으로 들어가지 않는다", () => {
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text" })],
      selectedIds: ["A"],
      editingId: null,
    });
    render(<Mount />);

    fireEvent.keyDown(window, { key: " " });
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("AC-4: 입력 중 Cmd+E는 무시 (typing guard)", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text" })],
      selectedIds: ["A"],
      editingId: null,
    });
    const { container } = render(
      <>
        <Mount />
        <input data-testid="typing" />
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    // target이 input인 keydown — typing guard로 차단돼야 함.
    fireEvent.keyDown(input, { key: "e", code: "KeyE", metaKey: true });
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("AC-5: textarea 안 Enter (no modifier) → 카드 생성 안 됨·편집 해제 안 됨", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [
        makeCard({ id: "A", kind: "text", content: "본문" }),
      ],
      selectedIds: ["A"],
      editingId: "A",
    });
    const { container } = render(
      <>
        <Mount />
        <textarea data-testid="editor" />
      </>,
    );
    const ta = container.querySelector("textarea")!;
    ta.focus();
    fireEvent.keyDown(ta, { key: "Enter", code: "Enter" });

    // 카드 그대로, editingId 그대로 — Cmd가 없으니 next-card 발동 X.
    expect(useWorkspace.getState().cards).toHaveLength(1);
    expect(useWorkspace.getState().editingId).toBe("A");
  });

  it("Cmd+Enter — 편집 중 카드 (내용 있음) → 새 카드 + editingId 새 카드", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [
        makeCard({
          id: "A",
          kind: "text",
          content: "메모",
          height: 80,
        }),
      ],
      selectedIds: ["A"],
      editingId: "A",
    });
    render(<Mount />);

    fireEvent.keyDown(window, {
      key: "Enter",
      code: "Enter",
      metaKey: true,
    });
    const state = useWorkspace.getState();
    expect(state.cards).toHaveLength(2);
    const created = state.cards.find((c) => c.id !== "A")!;
    expect(state.editingId).toBe(created.id);
  });

  it("Cmd+Enter — 빈 카드면 새 카드 안 생기고 편집만 종료", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text", content: "" })],
      selectedIds: ["A"],
      editingId: "A",
    });
    render(<Mount />);

    fireEvent.keyDown(window, {
      key: "Enter",
      code: "Enter",
      metaKey: true,
    });
    expect(useWorkspace.getState().cards).toHaveLength(1);
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("Tab — 비편집 + 선택 1개 → 다음 카드로 선택 이동", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [
        makeCard({ id: "A", x: 0, y: 0 }),
        makeCard({ id: "B", x: 100, y: 0 }),
      ],
      selectedIds: ["A"],
      editingId: null,
    });
    render(<Mount />);

    fireEvent.keyDown(window, { key: "Tab", code: "Tab" });
    expect(useWorkspace.getState().selectedIds).toEqual(["B"]);
  });

  it("Shift+Tab — 이전 카드로 선택 이동", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [
        makeCard({ id: "A", x: 0, y: 0 }),
        makeCard({ id: "B", x: 100, y: 0 }),
      ],
      selectedIds: ["B"],
      editingId: null,
    });
    render(<Mount />);

    fireEvent.keyDown(window, {
      key: "Tab",
      code: "Tab",
      shiftKey: true,
    });
    expect(useWorkspace.getState().selectedIds).toEqual(["A"]);
  });

  it("Tab — 입력 중에는 무시 (브라우저 기본 흐름 보존)", async () => {
    // storage init은 안 함 — store 액션의 메모리 동작만 검증.
    // afterEach.resetDB와 addCardAt의 비동기 persist 사이 race 회피.
    useWorkspace.setState({
      cards: [
        makeCard({ id: "A", x: 0, y: 0 }),
        makeCard({ id: "B", x: 100, y: 0 }),
      ],
      selectedIds: ["A"],
    });
    const { container } = render(
      <>
        <Mount />
        <input data-testid="typing" />
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(useWorkspace.getState().selectedIds).toEqual(["A"]);
  });

  it("AC-6: useShortcuts와 공존해도 Cmd+1로 카드 생성 정상 동작", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<MountBoth />);

    const before = useWorkspace.getState().cards.length;
    fireEvent.keyDown(window, {
      key: "1",
      code: "Digit1",
      metaKey: true,
    });
    await new Promise((r) => setTimeout(r, 10));
    const after = useWorkspace.getState().cards;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].kind).toBe("text");
  });
});
