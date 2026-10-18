import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { readFrameContent } from "@/state/frameContent";

// FEAT-frame-image-template n2: 판 배경 이미지 저장·정리·비율 맞춤.

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
  vi.restoreAllMocks();
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

const frameOf = (id: string) => useWorkspace.getState().cards.find((c) => c.id === id)!;
const cardOf = (id: string) => useWorkspace.getState().cards.find((c) => c.id === id)!;

/** 지운 파일 ref 목록을 모으는 스파이 — purgeAttachments가 실제 파일 삭제 경로다. */
function spyPurge() {
  const purged: string[] = [];
  vi.spyOn(useStorage.getState(), "purgeAttachments").mockImplementation(async (notes) => {
    for (const n of notes) if (n.attachmentRef) purged.push(n.attachmentRef);
  });
  return purged;
}

const photo = (ref: string, w = 800, h = 400) => ({ ref, mediaType: "image/png", w, h });

describe("setFrameBackground — 올리기", () => {
  it("ref·mediaType·bg 크기를 저장하고 폭은 그대로, 높이를 이미지 비율에 맞춘다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0); // 폭 320
    useWorkspace.getState().setFrameBackground(id, photo("opfs:a.png", 800, 400));
    const f = frameOf(id);
    expect(f.attachmentRef).toBe("opfs:a.png");
    expect(f.mediaType).toBe("image/png");
    expect(f.width).toBe(320);
    expect(f.height).toBe(160); // 320 × 400 / 800
    expect(readFrameContent(f.content).bg).toEqual({ w: 800, h: 400 });
  });

  it("새로고침(DB 다시 읽기) 뒤에도 ref·bg가 남는다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:keep.png", 400, 600));
    await flushAll();
    await new Promise((r) => setTimeout(r, 20));
    const note = await getDB().notes.get(id);
    expect(note?.attachmentRef).toBe("opfs:keep.png");
    expect(note?.mediaType).toBe("image/png");
    expect(readFrameContent(note?.content).bg).toEqual({ w: 400, h: 600 });

    useWorkspace.setState({ cards: [] });
    await useWorkspace.getState().loadFromStorage();
    const f = frameOf(id);
    expect(f.attachmentRef).toBe("opfs:keep.png");
    expect(readFrameContent(f.content).bg).toEqual({ w: 400, h: 600 });
  });

  it("이미지 높이가 한도를 넘으면 최대 높이로 자른다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:tall.png", 100, 1000));
    expect(frameOf(id).height).toBe(1200);
  });

  it("원본 크기를 못 읽으면(0) 판 크기를 건드리지 않고 bg도 없다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    const before = frameOf(id).height;
    useWorkspace.getState().setFrameBackground(id, photo("opfs:svg.svg", 0, 0));
    expect(frameOf(id).height).toBe(before);
    expect(frameOf(id).attachmentRef).toBe("opfs:svg.svg");
    expect(readFrameContent(frameOf(id).content).bg).toBeUndefined();
  });

  it("이름과 칸 목록은 그대로 남고, 이름을 바꿔도 bg가 안 지워진다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameSkin(id, "columns");
    useWorkspace.getState().setFrameBackground(id, photo("opfs:a.png"));
    useWorkspace.getState().renameFrame(id, "회고");
    const cfg = readFrameContent(frameOf(id).content);
    expect(cfg.name).toBe("회고");
    expect(cfg.bg).toEqual({ w: 800, h: 400 });
    expect(cfg.columns).toHaveLength(3);
  });

  it("멤버 메모 좌표는 그대로, 커져서 새로 안에 든 메모는 손 리사이즈와 같이 소속된다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0); // 320×220 (0..320, 0..220)
    const inside = pushMemo({ id: "in", x: 10, y: 10 });
    useWorkspace.getState().resolveMembership([inside.id]);
    const below = pushMemo({ id: "below", x: 20, y: 300 }); // 중심 70,350 — 판 밖
    useWorkspace.getState().resolveMembership([below.id]);
    expect(cardOf("below").frameId).toBeUndefined();

    // 320 × 1200/800 = 480 → 판이 0..480으로 커져 중심 350이 안으로 든다.
    useWorkspace.getState().setFrameBackground(id, photo("opfs:tall.png", 800, 1200));
    expect(frameOf(id).height).toBe(480);
    expect(cardOf("below").frameId).toBe(id);
    expect(cardOf("in").frameId).toBe(id);
    expect([cardOf("in").x, cardOf("in").y]).toEqual([10, 10]);
    expect([cardOf("below").x, cardOf("below").y]).toEqual([20, 300]);

    // 같은 크기를 손으로 맞춰 리사이즈한 결과와 같다.
    const other = useWorkspace.getState().addFrameAt(2000, 0);
    const m = pushMemo({ id: "m2", x: 2020, y: 300 });
    useWorkspace.getState().resolveMembership([m.id]);
    useWorkspace.getState().resizeFrame(other, { width: 320, height: 480 });
    useWorkspace.getState().resolveMembership(
      useWorkspace.getState().cards.filter((c) => c.kind !== "frame").map((c) => c.id),
    );
    expect(cardOf("m2").frameId).toBe(other);
  });

  it("높이가 줄면 중심이 밖으로 나간 메모의 소속이 풀리되 좌표는 그대로다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0); // 높이 220
    const memo = pushMemo({ id: "low", x: 20, y: 150 }); // 중심 y 200
    useWorkspace.getState().resolveMembership([memo.id]);
    expect(cardOf("low").frameId).toBe(id);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:wide.png", 800, 400)); // 높이 160
    expect(cardOf("low").frameId).toBeUndefined();
    expect(cardOf("low").y).toBe(150);
  });
});

describe("옛 파일 정리", () => {
  it("배경을 바꾸면 옛 ref를 지우고, 같은 ref면 지우지 않는다", async () => {
    await init();
    const purged = spyPurge();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:one.png"));
    expect(purged).toEqual([]);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:two.png"));
    expect(purged).toEqual([]); // 새 ref 저장 전에는 옛 파일을 지우지 않는다
    await new Promise((r) => setTimeout(r, 30));
    expect(purged).toEqual(["opfs:one.png"]);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:two.png"));
    await new Promise((r) => setTimeout(r, 30));
    expect(purged).toEqual(["opfs:one.png"]);
    expect(frameOf(id).attachmentRef).toBe("opfs:two.png");
  });

  it("지우면 ref·mediaType·bg가 비고 파일을 지운다. 판 크기와 멤버는 그대로다", async () => {
    await init();
    const purged = spyPurge();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    const memo = pushMemo({ id: "mm", x: 10, y: 10 });
    useWorkspace.getState().resolveMembership([memo.id]);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:x.png", 800, 800));
    const sized = { w: frameOf(id).width, h: frameOf(id).height };

    useWorkspace.getState().clearFrameBackground(id);
    const f = frameOf(id);
    expect(f.attachmentRef).toBeUndefined();
    expect(f.mediaType).toBeUndefined();
    expect(readFrameContent(f.content).bg).toBeUndefined();
    expect({ w: f.width, h: f.height }).toEqual(sized);
    await new Promise((r) => setTimeout(r, 30));
    expect(purged).toEqual(["opfs:x.png"]);
    expect(cardOf("mm").frameId).toBe(id);

    await flushAll();
    await new Promise((r) => setTimeout(r, 20));
    const note = await getDB().notes.get(id);
    expect(note?.attachmentRef).toBeUndefined();
  });

  it("배경이 없는 판을 지워도 파일 삭제를 부르지 않는다", async () => {
    await init();
    const purged = spyPurge();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().clearFrameBackground(id);
    useWorkspace.getState().deleteFrame(id);
    expect(purged).toEqual([]);
  });

  it("판을 지우면 배경 파일도 지우고 멤버 메모는 제자리에 남는다", async () => {
    await init();
    const purged = spyPurge();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    const memo = pushMemo({ id: "stay", x: 10, y: 10 });
    useWorkspace.getState().resolveMembership([memo.id]);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:bye.png"));
    useWorkspace.getState().deleteFrame(id);
    expect(purged).toEqual(["opfs:bye.png"]);
    expect(cardOf("stay")).toMatchObject({ x: 10, y: 10, frameId: undefined });
  });

  it("파일 삭제가 실패해도 조용히 넘어간다", async () => {
    await init();
    vi.spyOn(useStorage.getState(), "purgeAttachments").mockRejectedValue(new Error("opfs"));
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:a.png"));
    expect(() => useWorkspace.getState().deleteFrame(id)).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("resizeFrame — 배경이 있으면 비율을 지킨다", () => {
  it("폭을 바꾸면 높이가 폭 × h ÷ w로 따라온다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:r.png", 800, 400)); // 2:1
    useWorkspace.getState().resizeFrame(id, { width: 600, height: 999, baseWidth: 600 });
    expect(frameOf(id).width).toBe(600);
    expect(frameOf(id).height).toBe(300);
  });

  it("위쪽 모서리 핸들은 아래 가장자리를 고정한다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 100);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:r.png", 800, 400));
    const f0 = frameOf(id);
    const bottom = f0.y + f0.height!;
    // 왼쪽 위 핸들로 폭 320 → 600, 호출부는 높이를 제 마음대로 줄 수 있다.
    useWorkspace.getState().resizeFrame(id, {
      width: 600,
      height: 200,
      x: f0.x - 280,
      y: bottom - 200,
      baseWidth: 600,
    });
    const f = frameOf(id);
    expect(f.height).toBe(300);
    expect(f.y + f.height!).toBe(bottom);
  });

  it("배경을 지우면 다시 자유 리사이즈다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().setFrameBackground(id, photo("opfs:r.png", 800, 400));
    useWorkspace.getState().clearFrameBackground(id);
    useWorkspace.getState().resizeFrame(id, { width: 600, height: 500, baseWidth: 600 });
    expect(frameOf(id).height).toBe(500);
  });
});

