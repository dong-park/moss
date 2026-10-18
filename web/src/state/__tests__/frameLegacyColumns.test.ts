import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { decodeFrameConfig, readFrameContent } from "@/state/frameContent";

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
  await new Promise((r) => setTimeout(r, 20));
  await flushAll();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function init() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
}

function pushMemo(overrides: Partial<Card> & { id: string; x: number; y: number }): Card {
  const card: Card = { kind: "text", width: 100, height: 100, content: "", ...overrides };
  useWorkspace.setState((s) => ({ cards: [...s.cards, card] }));
  return card;
}

const card = (id: string) => useWorkspace.getState().cards.find((c) => c.id === id) as Card;

/** 옛 세로 칸 판: 폭 1920, 칸 4개. skin: "columns"로 저장돼 있다. */
const LEGACY_COLUMNS = [
  { id: "c0", name: "씨앗" },
  { id: "c1", name: "자라는 중" },
  { id: "c2", name: "" },
  { id: "c3", name: "묵힘" },
];

function pushLegacyFrame(): string {
  const frame: Card = {
    id: "legacy",
    kind: "frame",
    x: 0,
    y: 0,
    width: 1920,
    height: 400,
    content: JSON.stringify({ name: "옛 판", skin: "columns", columns: LEGACY_COLUMNS }),
  };
  useWorkspace.setState((s) => ({ cards: [...s.cards, frame] }));
  return frame.id;
}

describe("옛 세로 칸 판 하위 호환 (T6·D4 A)", () => {
  it("읽으면 폭·멤버 좌표·소속이 그대로이고, 설정에는 칸 그림 데이터가 없다", async () => {
    await init();
    const id = pushLegacyFrame();
    const members = [
      pushMemo({ id: "m1", x: 100, y: 100 }),
      pushMemo({ id: "m2", x: 700, y: 120 }),
      pushMemo({ id: "m3", x: 1500, y: 150 }),
    ];
    useWorkspace.getState().resolveMembership(members.map((m) => m.id));

    expect(card(id).width).toBe(1920);
    expect(members.map((m) => [card(m.id).x, card(m.id).y, card(m.id).frameId])).toEqual([
      [100, 100, id],
      [700, 120, id],
      [1500, 150, id],
    ]);
    expect(decodeFrameConfig(card(id).content)).toEqual({ name: "옛 판" });
  });

  it("이름을 바꿔도 content의 skin·columns가 원본 그대로 남는다", async () => {
    await init();
    const id = pushLegacyFrame();
    useWorkspace.getState().renameFrame(id, "회의 판");
    const raw = readFrameContent(card(id).content);
    expect(raw.name).toBe("회의 판");
    expect(raw.skin).toBe("columns");
    expect(raw.columns).toEqual(LEGACY_COLUMNS);
  });

  it("폭 상한은 max(1200, 지금 폭)이고 하한은 240이다", async () => {
    await init();
    const id = pushLegacyFrame();
    useWorkspace.getState().resizeFrame(id, { width: 2500, height: 400 });
    expect(card(id).width).toBe(1920); // 지금 폭을 넘겨 넓히지 못한다
    useWorkspace.getState().resizeFrame(id, { width: 1600, height: 400 });
    expect(card(id).width).toBe(1600); // 1200 위에서도 줄어든다
    useWorkspace.getState().resizeFrame(id, { width: 100, height: 400 });
    expect(card(id).width).toBe(240);

    const free = useWorkspace.getState().addFrameAt(2000, 0);
    useWorkspace.getState().resizeFrame(free, { width: 5000, height: 220 });
    expect(card(free).width).toBe(1200);
  });

  it("핸들 드래그 중 baseWidth(시작 폭)까지는 좁혔다 다시 넓힐 수 있다", async () => {
    await init();
    const id = pushLegacyFrame();
    useWorkspace.getState().resizeFrame(id, { width: 1300, height: 400, baseWidth: 1920 });
    expect(card(id).width).toBe(1300);
    useWorkspace.getState().resizeFrame(id, { width: 1900, height: 400, baseWidth: 1920 });
    expect(card(id).width).toBe(1900);
  });
});
