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

const card = (id: string) =>
  useWorkspace.getState().cards.find((c) => c.id === id) as Card;
const config = (id: string) => decodeFrameConfig(card(id).content);

describe("setFrameSkin (AC-3·AC-4)", () => {
  it("세로 칸으로 바꾸면 기본 3칸이 생기고, 자유로 돌아가도 칸을 보관한다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    expect(config(id).skin).toBe("free");

    useWorkspace.getState().setFrameSkin(id, "columns");
    expect(config(id).skin).toBe("columns");
    expect(config(id).columns.map((c) => c.name)).toEqual(["씨앗", "자라는 중", "묵힘"]);

    useWorkspace.getState().renameFrameColumn(id, config(id).columns[0].id, "아이디어");
    useWorkspace.getState().setFrameSkin(id, "free");
    expect(config(id).skin).toBe("free");
    expect(config(id).columns[0].name).toBe("아이디어");

    useWorkspace.getState().setFrameSkin(id, "columns");
    expect(config(id).columns[0].name).toBe("아이디어");
  });

  it("AC-3: 전환해도 메모 좌표와 판 소속이 그대로다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    const memo = pushMemo({ id: "m-ac3", x: 100, y: 100 });
    useWorkspace.getState().resolveMembership([memo.id]);
    const before = card(memo.id);
    expect(before.frameId).toBe(id);

    useWorkspace.getState().setFrameSkin(id, "columns");
    expect(card(memo.id).x).toBe(before.x);
    expect(card(memo.id).y).toBe(before.y);
    expect(card(memo.id).frameId).toBe(id);
  });

  it("AC-4: 좁은 판은 칸 수 × 240으로 넓어지고 왼쪽 위 모서리는 그대로다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(10, 20); // 320 폭
    useWorkspace.getState().setFrameSkin(id, "columns");
    expect(card(id).width).toBe(720); // 3 × 240
    expect(card(id).x).toBe(10);
    expect(card(id).y).toBe(20);
  });

  it("AC-4: 넓힌 뒤 새로 판 안에 든 메모의 소속을 다시 판정한다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0); // 0..320
    const memo = pushMemo({ id: "m-widen", x: 500, y: 100 }); // 중심 550,150 — 넓히기 전엔 밖
    useWorkspace.getState().resolveMembership([memo.id]);
    expect(card(memo.id).frameId).toBeUndefined();

    useWorkspace.getState().setFrameSkin(id, "columns"); // 0..720
    expect(card(memo.id).frameId).toBe(id);
    expect(card(memo.id).x).toBe(500);
  });
});

describe("addFrameColumn (AC-6)", () => {
  it("오른쪽 끝에 빈 칸이 생기고 필요하면 폭이 넓어진다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns"); // 720, 3칸
    useWorkspace.getState().addFrameColumn(id);
    expect(config(id).columns).toHaveLength(4);
    expect(config(id).columns[3].name).toBe("");
    expect(card(id).width).toBe(960); // 4 × 240

    useWorkspace.getState().resizeFrame(id, { width: 2000, height: 220 });
    useWorkspace.getState().addFrameColumn(id);
    expect(card(id).width).toBe(2000); // 이미 넓으면 안 늘어난다
    expect(config(id).columns).toHaveLength(5);
  });

  it("8개에서 더 못 늘린다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    for (let i = 0; i < 10; i++) useWorkspace.getState().addFrameColumn(id);
    expect(config(id).columns).toHaveLength(8);
  });
});

describe("renameFrameColumn (AC-7)", () => {
  it("trim·20자 제한, 빈 이름 허용", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    const col = config(id).columns[0].id;
    useWorkspace.getState().renameFrameColumn(id, col, "  " + "가".repeat(30) + "  ");
    expect(config(id).columns[0].name).toBe("가".repeat(20));
    useWorkspace.getState().renameFrameColumn(id, col, "   ");
    expect(config(id).columns[0].name).toBe("");
  });
});

describe("removeFrameColumn (AC-8)", () => {
  it("가운데 칸을 지워도 판 폭·메모 좌표·소속은 그대로다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    const memo = pushMemo({ id: "m-ac8", x: 100, y: 100 });
    useWorkspace.getState().setFrameSkin(id, "columns"); // 720
    useWorkspace.getState().resolveMembership([memo.id]);
    const width = card(id).width;
    const middle = config(id).columns[1].id;

    useWorkspace.getState().removeFrameColumn(id, middle);
    expect(config(id).columns).toHaveLength(2);
    expect(card(id).width).toBe(width);
    expect(card(memo.id).x).toBe(100);
    expect(card(memo.id).frameId).toBe(id);
  });

  it("2개에선 지우지 않는다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    useWorkspace.getState().removeFrameColumn(id, config(id).columns[0].id);
    expect(config(id).columns).toHaveLength(2);
    useWorkspace.getState().removeFrameColumn(id, config(id).columns[0].id);
    expect(config(id).columns).toHaveLength(2);
  });
});

describe("스킨별 폭 하한·상한 (AC-9·AC-10)", () => {
  it("AC-9: 3칸 판은 720보다 좁게 줄일 수 없다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    useWorkspace.getState().resizeFrame(id, { width: 900, height: 220 });
    expect(card(id).width).toBe(900);
    useWorkspace.getState().resizeFrame(id, { width: 1200, height: 220 });
    expect(card(id).width).toBe(1200);
    useWorkspace.getState().resizeFrame(id, { width: 500, height: 220 });
    expect(card(id).width).toBe(720);
  });

  it("AC-10: 8칸 판은 2400에서 멈추고 자유 판은 1200에서 멈춘다", async () => {
    await init();
    const cols = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(cols, "columns");
    for (let i = 0; i < 8; i++) useWorkspace.getState().addFrameColumn(cols);
    useWorkspace.getState().resizeFrame(cols, { width: 5000, height: 220 });
    expect(card(cols).width).toBe(2400);

    const free = useWorkspace.getState().addFrameAt(1000, 0);
    useWorkspace.getState().resizeFrame(free, { width: 5000, height: 220 });
    expect(card(free).width).toBe(1200);
  });

  it("AC-10: 1920 세로 칸 판을 자유로 바꾸면 1920을 유지하고 더 못 넓힌다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    useWorkspace.getState().resizeFrame(id, { width: 1920, height: 400 });
    useWorkspace.getState().setFrameSkin(id, "free");
    expect(card(id).width).toBe(1920);

    useWorkspace.getState().resizeFrame(id, { width: 2500, height: 400 });
    expect(card(id).width).toBe(1920);

    useWorkspace.getState().resizeFrame(id, { width: 1100, height: 400 });
    expect(card(id).width).toBe(1100);
    useWorkspace.getState().resizeFrame(id, { width: 2500, height: 400 });
    expect(card(id).width).toBe(1200);
  });
});

describe("AC-11 판 이름 바꾸기가 스킨을 지우지 않음", () => {
  it("이름을 바꿔도 skin·columns가 남는다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    const col = config(id).columns[1].id;
    useWorkspace.getState().renameFrameColumn(id, col, "메모");

    useWorkspace.getState().renameFrame(id, "회의 판");
    const cfg = config(id);
    expect(cfg.name).toBe("회의 판");
    expect(cfg.skin).toBe("columns");
    expect(cfg.columns).toHaveLength(3);
    expect(cfg.columns[1].name).toBe("메모");
    // 저장 형식에도 반영
    expect(readFrameContent(card(id).content).skin).toBe("columns");
  });
});
