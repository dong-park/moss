import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_BOARD_ID,
  useWorkspace,
  type Card,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

/**
 * FEAT-card-flow §10 DOD — Store 액션 3개 단위 테스트.
 * AC-1: commitAndAddNext (콘텐츠 있음 → 새 카드 + editingId 갱신)
 * AC-2: commitAndAddNext (빈 콘텐츠 → null + 새 카드 안 생김)
 * AC-3: focusNextCard (Tab/Shift+Tab 위치 정렬)
 * AC-4: enterEditOnSelected (선택 1개·캡처 카드 → editingId 세팅)
 */

let originalStorage: PropertyDescriptor | undefined;

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
  vi.useRealTimers();
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
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

/**
 * 본 테스트는 store 액션의 메모리 동작만 검증한다.
 * storage.initialized=false 상태에서 persistCard는 early-return하므로
 * DB를 일부러 init하지 않는다 — afterEach.resetDB와의 race 회피.
 */
function bootstrap() {
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
  });
}

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

describe("FEAT-card-flow · commitAndAddNext (AC-1, AC-2)", () => {
  it("AC-1: 콘텐츠 있는 캡처 카드 → 새 카드 + editingId 갱신 + 위치 +height+64", async () => {
    bootstrap();
    const base = makeCard({
      id: "src",
      kind: "text",
      x: 100,
      y: 200,
      width: 240,
      height: 80,
      content: "메모 본문",
    });
    useWorkspace.setState({
      cards: [base],
      selectedIds: ["src"],
      editingId: "src",
    });

    const newId = useWorkspace.getState().commitAndAddNext("src");

    expect(newId).not.toBeNull();
    const cards = useWorkspace.getState().cards;
    expect(cards).toHaveLength(2);
    const created = cards.find((c) => c.id === newId)!;
    expect(created.kind).toBe("text");
    expect(created.x).toBe(100);
    expect(created.y).toBe(200 + 80 + 64);
    // 새 카드가 자동 편집 모드로 진입.
    expect(useWorkspace.getState().editingId).toBe(newId);
    // 선택도 새 카드로 옮겨감 (addCardAt 동작).
    expect(useWorkspace.getState().selectedIds).toEqual([newId]);
  });

  it("AC-1: height 미정의 시 CARD_MIN_HEIGHT(60) + 64로 떨어진다", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [
        makeCard({ id: "src", x: 50, y: 100, content: "x", width: 240 }),
      ],
      editingId: "src",
    });
    const newId = useWorkspace.getState().commitAndAddNext("src");
    const created = useWorkspace
      .getState()
      .cards.find((c) => c.id === newId)!;
    expect(created.y).toBe(100 + 60 + 64);
  });

  it("AC-2: 빈 카드 (content === '') → null 반환·새 카드 없음·편집만 종료", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [makeCard({ id: "src", content: "" })],
      editingId: "src",
    });

    const result = useWorkspace.getState().commitAndAddNext("src");

    expect(result).toBeNull();
    expect(useWorkspace.getState().cards).toHaveLength(1);
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("AC-2 변형: board 카드(non-capture)에서 호출 시 새 카드 안 생김", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [
        makeCard({
          id: "src",
          kind: "board",
          content: "",
        }),
      ],
      editingId: "src",
    });
    const result = useWorkspace.getState().commitAndAddNext("src");
    expect(result).toBeNull();
    expect(useWorkspace.getState().cards).toHaveLength(1);
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("같은 종류 유지 — checklist에서 호출 시 checklist 생성", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [
        makeCard({
          id: "src",
          kind: "checklist",
          width: 460,
          height: 100,
          content: "할 일 1",
        }),
      ],
      editingId: "src",
    });
    const newId = useWorkspace.getState().commitAndAddNext("src");
    const created = useWorkspace
      .getState()
      .cards.find((c) => c.id === newId)!;
    expect(created.kind).toBe("checklist");
  });
});

describe("FEAT-card-flow · focusNextCard (AC-3)", () => {
  it("Tab(direction=1) → (y,x) 사전식 다음 카드 선택", async () => {
    bootstrap();
    // 위치: A(0,0), B(0,100) — 같은 y, 더 오른쪽 / C(200,50) — 더 아래
    const a = makeCard({ id: "A", x: 0, y: 0 });
    const b = makeCard({ id: "B", x: 100, y: 0 });
    const c = makeCard({ id: "C", x: 50, y: 200 });
    useWorkspace.setState({ cards: [c, a, b], selectedIds: ["A"] });

    useWorkspace.getState().focusNextCard(1);
    expect(useWorkspace.getState().selectedIds).toEqual(["B"]);

    useWorkspace.getState().focusNextCard(1);
    expect(useWorkspace.getState().selectedIds).toEqual(["C"]);
  });

  it("Shift+Tab(direction=-1) → 이전 카드", async () => {
    bootstrap();
    const a = makeCard({ id: "A", x: 0, y: 0 });
    const b = makeCard({ id: "B", x: 100, y: 0 });
    useWorkspace.setState({ cards: [a, b], selectedIds: ["B"] });

    useWorkspace.getState().focusNextCard(-1);
    expect(useWorkspace.getState().selectedIds).toEqual(["A"]);
  });

  it("경계 도달 시 no-op (wrap 안 함)", async () => {
    bootstrap();
    const a = makeCard({ id: "A", x: 0, y: 0 });
    const b = makeCard({ id: "B", x: 100, y: 0 });
    useWorkspace.setState({ cards: [a, b], selectedIds: ["B"] });

    useWorkspace.getState().focusNextCard(1);
    expect(useWorkspace.getState().selectedIds).toEqual(["B"]);

    useWorkspace.setState({ selectedIds: ["A"] });
    useWorkspace.getState().focusNextCard(-1);
    expect(useWorkspace.getState().selectedIds).toEqual(["A"]);
  });

  it("선택 0개 또는 2개면 no-op", async () => {
    bootstrap();
    const a = makeCard({ id: "A", x: 0, y: 0 });
    const b = makeCard({ id: "B", x: 100, y: 0 });
    useWorkspace.setState({ cards: [a, b], selectedIds: [] });
    useWorkspace.getState().focusNextCard(1);
    expect(useWorkspace.getState().selectedIds).toEqual([]);

    useWorkspace.setState({ selectedIds: ["A", "B"] });
    useWorkspace.getState().focusNextCard(1);
    expect(useWorkspace.getState().selectedIds).toEqual(["A", "B"]);
  });
});

describe("FEAT-card-flow · enterEditOnSelected (AC-4)", () => {
  it("선택 1개·캡처 카드 → editingId 세팅", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [makeCard({ id: "A", kind: "text" })],
      selectedIds: ["A"],
      editingId: null,
    });
    useWorkspace.getState().enterEditOnSelected();
    expect(useWorkspace.getState().editingId).toBe("A");
  });

  it("선택 0개 → no-op", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [makeCard({ id: "A" })],
      selectedIds: [],
    });
    useWorkspace.getState().enterEditOnSelected();
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("선택 2개 → no-op", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [makeCard({ id: "A" }), makeCard({ id: "B", x: 100 })],
      selectedIds: ["A", "B"],
    });
    useWorkspace.getState().enterEditOnSelected();
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("board(비-capture) 카드 → no-op", async () => {
    bootstrap();
    useWorkspace.setState({
      cards: [makeCard({ id: "C", kind: "board" })],
      selectedIds: ["C"],
    });
    useWorkspace.getState().enterEditOnSelected();
    expect(useWorkspace.getState().editingId).toBeNull();
  });
});
