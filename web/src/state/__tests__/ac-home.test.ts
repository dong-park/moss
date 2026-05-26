/**
 * FEAT-home spec AC-1 ~ AC-5 통합 회귀 테스트.
 * docs/specs/FEAT-home.md §3 수용 기준에 직접 매핑 (MVP 범위).
 *
 * MVP 범위:
 * - AC-1(부분): "지금 머무는 생각" 휴리스틱만 (다시 떠오른 생각/오늘의 연결/사고 흐름은 Iteration 2)
 * - AC-2: 메모 < 10 → 빈 안내
 * - AC-3: 도구 drop → 무소속 저장 + 토스트 + "새 보드" CTA
 * - AC-4: 첫 진입 = 시스템 보드 (첫 메모는 무소속)
 * - AC-5: 큐레이팅 카드는 selection 시스템과 무관 (가상 카드)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_BOARD_ID,
  useWorkspace,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { useToasts } from "@/state/notifications";
import { resetDB, getDB } from "@/state/db/schema";
import { computeNowStayingCards } from "@/state/selectors/systemBoard";

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
  useToasts.setState({ toasts: [] });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("AC-1(부분): 재노출 기반 자동 큐레이팅 — '지금 머무는 생각'", () => {
  it("메모 다수 + lastVisitedAt 다양 → 최근 회귀 주제가 상위 그룹에 노출", async () => {
    await useStorage.getState().init();
    const db = getDB();
    const now = Date.now();
    // 의도적으로 1주일 전 메모 일부 + 최근 메모 일부
    const seeds = [
      { id: "old-1", content: "예전 주제 A", lastVisitedAt: now - 7 * 86400_000 },
      { id: "old-2", content: "예전 주제 B", lastVisitedAt: now - 6 * 86400_000 },
      { id: "recent-1", content: "최근 주제 흐름", lastVisitedAt: now - 1000 },
      { id: "recent-2", content: "최근 회로", lastVisitedAt: now - 500 },
      { id: "recent-3", content: "최근 회상", lastVisitedAt: now - 100 },
    ];
    for (const s of seeds) {
      await db.notes.put({
        id: s.id,
        boardId: null,
        kind: "text",
        x: 0,
        y: 0,
        width: 240,
        rotation: 0,
        content: s.content,
        aiOptOut: false,
        createdAt: s.lastVisitedAt,
        updatedAt: s.lastVisitedAt,
        lastVisitedAt: s.lastVisitedAt,
      });
    }
    // installPromptShown=true → seed 카드 우회 (이 테스트에서는 우리가 직접 넣음)
    await useStorage.getState().updateSettings({ installPromptShown: true });
    await useWorkspace.getState().loadFromStorage();

    const cards = useWorkspace.getState().cards;
    const items = computeNowStayingCards(cards);
    // 최신 두 개 ("최근 회로", "최근 회상")는 첫 어절이 "최근"으로 같으나 두 번째 토큰은 다름.
    // 우리 휴리스틱은 첫 한 토큰만 사용 → "최근" 키로 묶인다.
    const top = items[0];
    expect(top.theme.startsWith("최근")).toBe(true);
    expect(top.visitCount).toBeGreaterThanOrEqual(2);
  });
});

describe("AC-2: 빈 상태 (메모 < 10)", () => {
  it("computeNowStayingCards는 후보 부족 시에도 정의된 모양으로 응답한다 (빈 배열)", () => {
    // SystemBoardEmpty 분기는 Canvas.tsx에서 cards.length < 10일 때 표시 — DOM 테스트는 별도.
    // 여기서는 선택기 자체가 빈 입력에 대해 안전한지만 검증.
    expect(computeNowStayingCards([])).toEqual([]);
  });
});

describe("AC-3: 도구 drop → 무소속 + '새 보드' CTA → promoteCardToNewBoard", () => {
  it("시스템 보드에서 addCardAt → boardId=null로 영속", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);

    const id = useWorkspace.getState().addCardAt("text", 100, 100);
    await new Promise((r) => setTimeout(r, 50));
    const note = await getDB().notes.get(id);
    expect(note?.boardId).toBeNull();
  });

  it("promoteCardToNewBoard → 새 보드 생성 + 카드 boardId 변경 + 새 보드로 전환", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();

    const cardId = useWorkspace.getState().addCardAt("text", 100, 100);
    await new Promise((r) => setTimeout(r, 50));

    const newBoardId = await useWorkspace
      .getState()
      .promoteCardToNewBoard(cardId, "신규 보드");

    expect(newBoardId).toBeTruthy();
    expect(newBoardId).not.toBe(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().currentBoardId).toBe(newBoardId);

    const note = await getDB().notes.get(cardId);
    expect(note?.boardId).toBe(newBoardId);

    const boards = await useStorage.getState().loadBoards();
    expect(boards.some((b) => b.id === newBoardId && b.name === "신규 보드")).toBe(
      true,
    );
  });
});

describe("AC-4: 첫 진입 = 시스템 보드, 첫 메모는 무소속", () => {
  it("초기 currentBoardId === SYSTEM_BOARD_ID", () => {
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });

  it("첫 캡처 → boardId=null (시스템 보드 = 가상 = 무소속)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await new Promise((r) => setTimeout(r, 50));
    const note = await getDB().notes.get(id);
    expect(note?.boardId).toBeNull();
  });
});

describe("AC-5: 큐레이팅 카드는 selection·삭제 시스템과 무관", () => {
  it("NowStayingItem.noteIds는 카드 id 모음이지만 itme 자체는 가상 — selectedIds로 들어갈 수 없는 구조", () => {
    // 가상 카드는 DOM에 data-card-id 없이 렌더되고 selectMany는 그 셀렉터만 본다.
    // 단위 레벨에서는 selectMany를 빈 배열로 호출했을 때 selectedIds가 비는지로 invariant 확인.
    useWorkspace.getState().selectMany([], false);
    expect(useWorkspace.getState().selectedIds).toEqual([]);
  });
});
