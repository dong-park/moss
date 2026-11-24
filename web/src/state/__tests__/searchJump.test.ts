import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStorage } from "@/state/storage";
import {
  FLASH_DURATION_MS,
  SYSTEM_BOARD_ID,
  useWorkspace,
} from "@/state/workspace";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";

/**
 * KS-5 T5/D5 — 검색 결과로 다른 벽의 포스트잇에 날아가 반짝인다.
 * 실제 openCardOnCanvas(Dexie → setCurrentBoard → panToCard)를 그대로 탄다.
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
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
    view: "canvas",
    viewSettledBoardIds: [],
    tableReturnBoardId: null,
    flashCardId: null,
    flashStartedAt: null,
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

/**
 * 실제 경로로 심는다: 벽 둘을 만들고(createBoard), 둘째 벽에 포스트잇을 붙인 뒤(addCardAt)
 * 첫째 벽으로 돌아온다. 카드는 문서가 원본이라 Dexie에 직접 쓰면 벽을 열어도 안 올라온다.
 */
async function setup() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  const ws = useWorkspace.getState();
  const wallA = await ws.createBoard("벽1");
  const wallB = await ws.createBoard("벽2");
  const n1 = useWorkspace.getState().addCardAt("text", 100, 200);
  useWorkspace.getState().setContent(n1, "이지은 약속");
  const n2 = useWorkspace.getState().addCardAt("text", 500, 500);
  useWorkspace.getState().setContent(n2, "두번째");
  await flushAll();
  await useWorkspace.getState().setCurrentBoard(wallA);
  useWorkspace.setState({ selectedIds: [], viewport: { x: 0, y: 0, scale: 1 } });
  return { wallA, wallB, n1, n2 };
}

describe("jumpToCardWithFlash (T5)", () => {
  it("다른 벽 카드 id로 부르면 그 벽으로 바뀌고 카드가 선택되며 반짝임이 켜진다", async () => {
    const { wallA, wallB, n1 } = await setup();
    expect(useWorkspace.getState().currentBoardId).toBe(wallA);
    await useWorkspace.getState().jumpToCardWithFlash(n1);

    const s = useWorkspace.getState();
    expect(s.currentBoardId).toBe(wallB);
    expect(s.selectedIds).toEqual([n1]);
    expect(s.flashCardId).toBe(n1);
    expect(s.flashStartedAt).not.toBeNull();
  });

  it("카드가 화면 가운데로 온다 (panToCard)", async () => {
    const { n1 } = await setup();
    await useWorkspace.getState().jumpToCardWithFlash(n1);
    const { viewport, cards } = useWorkspace.getState();
    const card = cards.find((c) => c.id === n1)!;
    // 카드 중심이 화면 가운데(window.innerWidth/2)에 오도록 평행이동
    expect(viewport.x).toBeCloseTo(
      window.innerWidth / 2 - (card.x + card.width / 2) * viewport.scale,
    );
  });

  it("1.2초 뒤 flashCardId가 비고 선택은 남는다 (D5)", async () => {
    const { n1 } = await setup();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await useWorkspace.getState().jumpToCardWithFlash(n1);
    expect(useWorkspace.getState().flashCardId).toBe(n1);

    vi.advanceTimersByTime(FLASH_DURATION_MS - 1);
    expect(useWorkspace.getState().flashCardId).toBe(n1);

    vi.advanceTimersByTime(1);
    const s = useWorkspace.getState();
    expect(s.flashCardId).toBeNull();
    expect(s.flashStartedAt).toBeNull();
    expect(s.selectedIds).toEqual([n1]);
  });

  it("반짝이는 중에 다른 카드로 다시 날아가면 앞 타이머가 새 반짝임을 지우지 않는다", async () => {
    const { n1, n2 } = await setup();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await useWorkspace.getState().jumpToCardWithFlash(n1);
    vi.advanceTimersByTime(800);
    await useWorkspace.getState().jumpToCardWithFlash(n2);
    expect(useWorkspace.getState().flashCardId).toBe(n2);

    // 첫 반짝임 타이머가 살아 있었다면 여기서 지웠을 시각
    vi.advanceTimersByTime(500);
    expect(useWorkspace.getState().flashCardId).toBe(n2);

    vi.advanceTimersByTime(FLASH_DURATION_MS);
    expect(useWorkspace.getState().flashCardId).toBeNull();
  });

  it("지워진 카드 id면 벽을 바꾸지 않고 반짝이지도 않는다", async () => {
    const { wallA } = await setup();
    await useWorkspace.getState().jumpToCardWithFlash("없는-카드");

    const s = useWorkspace.getState();
    expect(s.currentBoardId).toBe(wallA);
    expect(s.flashCardId).toBeNull();
    expect(s.selectedIds).toEqual([]);
  });
});
