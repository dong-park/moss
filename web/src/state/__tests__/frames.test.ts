import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";

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
  // resolveMembership/deleteFrame의 fire-and-forget(void) DB 트랜잭션이 아직
  // 끝나지 않았을 수 있다 — resetDB(db.close())보다 먼저 끝나도록 짧게 대기.
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
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

async function init() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
}

/** 테스트용 메모(text) 카드를 직접 cards 배열에 추가한다(addCardAt은 editing 등 부수효과가 많아 회피). */
function pushMemo(overrides: Partial<Card> & { id: string; x: number; y: number }): Card {
  const card: Card = {
    kind: "text",
    width: 100,
    height: 100,
    content: "",
    ...overrides,
  };
  useWorkspace.setState((s) => ({ cards: [...s.cards, card] }));
  return card;
}

describe("addFrameAt", () => {
  it("최소 240×160 이상 크기의 frame 카드를 만들고 영속한다", async () => {
    await init();
    const id = useWorkspace.getState().addFrameAt(10, 20);
    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.kind).toBe("frame");
    expect(card!.width).toBeGreaterThanOrEqual(240);
    expect(card!.height!).toBeGreaterThanOrEqual(160);
    expect(card?.x).toBe(10);
    expect(card?.y).toBe(20);

    await new Promise((r) => setTimeout(r, 10));
    const db = getDB();
    const note = await db.notes.get(id);
    expect(note?.kind).toBe("frame");
  });
});

describe("resolveMembership — 중심점 기준 소속 판정", () => {
  it("중심점이 판 안이면 속하고, 밖으로 나가면 소속이 풀린다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0); // 320×220 기본
    const memo = pushMemo({ id: "m1", x: 100, y: 100 }); // 중심 (150,150) — 판 안

    useWorkspace.getState().resolveMembership([memo.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBe(frameId);

    // 중심점을 판 밖으로 이동
    useWorkspace.setState((s) => ({
      cards: s.cards.map((c) => (c.id === memo.id ? { ...c, x: 1000, y: 1000 } : c)),
    }));
    useWorkspace.getState().resolveMembership([memo.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBeUndefined();
  });

  it("경계선 위의 점은 안으로 친다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0); // width320 height220
    const frame = useWorkspace.getState().cards.find((c) => c.id === frameId)!;
    // 중심점이 정확히 오른쪽 경계선(x = frame.x+frame.width)에 오도록 배치.
    const memo = pushMemo({
      id: "m-edge",
      x: frame.x + frame.width - 50,
      y: frame.y + 50,
      width: 100,
      height: 20,
    });
    // 중심 x = frame.x+frame.width-50+50 = frame.x+frame.width (경계선 위)
    useWorkspace.getState().resolveMembership([memo.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBe(frameId);
  });

  it("절반이 경계에 걸쳐도 중심점이 안이면 속한다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const frame = useWorkspace.getState().cards.find((c) => c.id === frameId)!;
    // 카드 오른쪽 30%가 판 경계 밖으로 나가도록 배치 — 중심점(center = right-20)은 안쪽.
    const memo = pushMemo({
      id: "m-half",
      x: frame.x + frame.width - 70,
      y: frame.y + 10,
      width: 100,
      height: 20,
    });
    useWorkspace.getState().resolveMembership([memo.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBe(frameId);
  });

  it("겹친 두 판이면 나중에 만든 판(=배열에서 더 뒤)에 속한다", async () => {
    await init();
    const frameA = useWorkspace.getState().addFrameAt(0, 0); // 0..320,0..220
    const frameB = useWorkspace.getState().addFrameAt(50, 50); // 50..370,50..270 — A와 겹침, B가 나중
    const memo = pushMemo({ id: "m-overlap", x: 100, y: 100 }); // 중심 150,150 — 둘 다 포함

    useWorkspace.getState().resolveMembership([memo.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBe(frameB);
    expect(frameA).not.toBe(frameB);
  });

  it("frame 카드 자신은 소속 대상에서 제외된다(중첩 불가, AC-12)", async () => {
    await init();
    const frameA = useWorkspace.getState().addFrameAt(0, 0); // 0..320,0..220
    const frameB = useWorkspace.getState().addFrameAt(50, 50); // 중심이 A 안에 들어가도록

    useWorkspace.getState().resolveMembership([frameA, frameB]);
    const b = useWorkspace.getState().cards.find((c) => c.id === frameB);
    expect(b?.frameId).toBeUndefined();

    // A를 옮겨도 B는 제자리 — moveFrame이 frameId===A인 멤버만 옮기므로 B(frame, 소속 없음)는 영향 없음.
    const beforeX = b!.x;
    useWorkspace.getState().moveFrame(frameA, 500, 500);
    const bAfter = useWorkspace.getState().cards.find((c) => c.id === frameB);
    expect(bAfter?.x).toBe(beforeX);
  });

  it("파일함(board kind) 카드도 판에 속할 수 있다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const funnel = pushMemo({
      id: "funnel-1",
      kind: "board",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      boardRef: "sub-1",
    });
    useWorkspace.getState().resolveMembership([funnel.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === funnel.id)?.frameId,
    ).toBe(frameId);
  });
});

describe("moveFrame — 판 이동 시 속한 메모만 같은 거리로 이동", () => {
  it("판에 속한 메모만 이동하고, 속하지 않은 메모는 제자리", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const inside = pushMemo({ id: "in-1", x: 100, y: 100 });
    const outside = pushMemo({ id: "out-1", x: 1000, y: 1000 });
    useWorkspace.getState().resolveMembership([inside.id, outside.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === inside.id)?.frameId,
    ).toBe(frameId);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === outside.id)?.frameId,
    ).toBeUndefined();

    useWorkspace.getState().moveFrame(frameId, 200, 0);

    const insideAfter = useWorkspace.getState().cards.find((c) => c.id === inside.id)!;
    const outsideAfter = useWorkspace.getState().cards.find((c) => c.id === outside.id)!;
    const frameAfter = useWorkspace.getState().cards.find((c) => c.id === frameId)!;

    expect(frameAfter.x).toBe(200);
    expect(insideAfter.x).toBe(300); // 100 + 200
    expect(outsideAfter.x).toBe(1000); // 불변
  });

  it("판+속한 메모를 한 트랜잭션으로 저장한다(일부만 저장 안 됨)", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const inside = pushMemo({ id: "tx-1", x: 100, y: 100 });
    // moveFrame의 트랜잭션은 기존 DB row를 modify하므로, 실제 앱처럼 카드가 이미
    // 저장돼 있어야 한다(pushMemo는 in-memory state만 채우는 테스트 헬퍼).
    await getDB().notes.put({
      id: inside.id,
      boardId: null,
      kind: "text",
      x: inside.x,
      y: inside.y,
      width: inside.width,
      height: inside.height,
      rotation: 0,
      content: "",
      aiOptOut: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastVisitedAt: Date.now(),
    });
    useWorkspace.getState().resolveMembership([inside.id]);

    useWorkspace.getState().moveFrame(frameId, 50, 60);
    await flushAll();

    const db = getDB();
    const frameNote = await db.notes.get(frameId);
    const memoNote = await db.notes.get(inside.id);
    expect(frameNote?.x).toBe(50);
    expect(memoNote?.x).toBe(150); // 100+50
    expect(memoNote?.y).toBe(160); // 100+60
  });
});

describe("메모판 삭제 — 속한 메모는 제자리, frameId만 해제", () => {
  it("deleteFrame 후 메모는 남고 frameId가 풀린다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const inside = pushMemo({ id: "del-1", x: 100, y: 100 });
    await getDB().notes.put({
      id: inside.id,
      boardId: null,
      kind: "text",
      x: inside.x,
      y: inside.y,
      width: inside.width,
      height: inside.height,
      rotation: 0,
      content: "",
      frameId: undefined,
      aiOptOut: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastVisitedAt: Date.now(),
    });
    useWorkspace.getState().resolveMembership([inside.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === inside.id)?.frameId,
    ).toBe(frameId);

    useWorkspace.getState().deleteFrame(frameId);

    const state = useWorkspace.getState();
    expect(state.cards.find((c) => c.id === frameId)).toBeUndefined();
    const memo = state.cards.find((c) => c.id === inside.id);
    expect(memo).toBeDefined();
    expect(memo?.frameId).toBeUndefined();
    expect(memo?.x).toBe(100);
    expect(memo?.y).toBe(100);

    // resolveMembership/deleteFrame의 DB 트랜잭션은 fire-and-forget(void)이라 짧게 대기.
    await new Promise((r) => setTimeout(r, 20));
    const db = getDB();
    expect(await db.notes.get(frameId)).toBeUndefined();
    const memoNote = await db.notes.get(inside.id);
    expect(memoNote?.frameId).toBeUndefined();
  });

  it("remove(frameId)로 지워도 동일하게 동작한다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const inside = pushMemo({ id: "del-2", x: 100, y: 100 });
    useWorkspace.getState().resolveMembership([inside.id]);

    useWorkspace.getState().remove(frameId);

    const state = useWorkspace.getState();
    expect(state.cards.find((c) => c.id === frameId)).toBeUndefined();
    expect(state.cards.find((c) => c.id === inside.id)?.frameId).toBeUndefined();
  });
});

describe("resizeFrame — 리사이즈로 빠진 메모는 소속 해제", () => {
  it("판을 줄여 중심점이 밖으로 나간 메모는 소속이 풀린다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0); // 320×220
    const memo = pushMemo({ id: "shrink-1", x: 250, y: 20 }); // 중심 300,70 — 기본 판 안
    useWorkspace.getState().resolveMembership([memo.id]);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBe(frameId);

    // 판을 좁혀 x축 240까지만 남기면 중심(300)이 밖으로 나간다.
    useWorkspace.getState().resizeFrame(frameId, { width: 240, height: 160 });
    useWorkspace.getState().resolveMembership(
      useWorkspace.getState().cards.filter((c) => c.kind !== "frame").map((c) => c.id),
    );

    expect(
      useWorkspace.getState().cards.find((c) => c.id === memo.id)?.frameId,
    ).toBeUndefined();
  });

  it("리사이즈는 최소 240×160 아래로 줄지 않는다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().resizeFrame(frameId, { width: 10, height: 10 });
    const frame = useWorkspace.getState().cards.find((c) => c.id === frameId)!;
    expect(frame.width).toBe(240);
    expect(frame.height).toBe(160);
  });
});

describe("renameFrame", () => {
  it("빈 이름은 '새 메모판'으로 되돌린다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    useWorkspace.getState().renameFrame(frameId, "   ");
    const frame = useWorkspace.getState().cards.find((c) => c.id === frameId)!;
    expect(JSON.parse(frame.content).name).toBe("새 메모판");
  });

  it("40자를 넘는 이름은 40자로 잘린다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const longName = "가".repeat(50);
    useWorkspace.getState().renameFrame(frameId, longName);
    const frame = useWorkspace.getState().cards.find((c) => c.id === frameId)!;
    expect(JSON.parse(frame.content).name).toHaveLength(40);
  });
});

describe("성능: 메모 50개 판 이동", () => {
  it("50개 멤버 이동 처리 시간이 16ms 아래다", async () => {
    await init();
    const frameId = useWorkspace.getState().addFrameAt(0, 0);
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const memo = pushMemo({ id: `perf-${i}`, x: 10 + i, y: 10 });
      ids.push(memo.id);
    }
    useWorkspace.getState().resolveMembership(ids);
    const memberCount = useWorkspace
      .getState()
      .cards.filter((c) => c.frameId === frameId).length;
    expect(memberCount).toBe(50);

    const start = performance.now();
    useWorkspace.getState().moveFrame(frameId, 5, 5);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(16);
  });
});
