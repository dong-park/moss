import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { FirstBoardChooser } from "@/components/workspace/FirstBoardChooser";
import {
  SYSTEM_BOARD_ID,
  __internal,
  needsFirstBoard,
  useWorkspace,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

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

function mount() {
  return render(
    <I18nProvider locale="ko">
      <FirstBoardChooser />
    </I18nProvider>,
  );
}

describe("needsFirstBoard · 첫 보드 고르기 판정 (AC-5·AC-7)", () => {
  const systemBoard = {
    id: SYSTEM_BOARD_ID,
    name: "",
    isSystem: true,
    createdAt: 0,
    updatedAt: 0,
    lastOpenedAt: 0,
  };

  it("사용자 보드가 없고 시스템 보드에 예제 메모만 있으면 true (새 사용자)", () => {
    expect(needsFirstBoard([systemBoard], __internal.SEED_CARDS)).toBe(true);
  });

  it("시스템 보드가 비어 있어도 true", () => {
    expect(needsFirstBoard([systemBoard], [])).toBe(true);
  });

  it("시스템 보드에 사용자가 만든 메모가 있으면 false (기존 사용자, AC-7)", () => {
    const userCard = { ...__internal.SEED_CARDS[0], id: "c-user-made" };
    expect(needsFirstBoard([systemBoard], [userCard])).toBe(false);
  });

  it("사용자 보드가 하나라도 있으면 false", () => {
    expect(
      needsFirstBoard(
        [systemBoard, { ...systemBoard, id: "board-a", isSystem: false }],
        [],
      ),
    ).toBe(false);
  });
});

describe("AC-5 · 첫 보드 고르기", () => {
  it("두 버튼이 보인다", () => {
    mount();
    expect(screen.getByRole("button", { name: "예제로 시작" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "빈 보드로 시작" })).toBeTruthy();
  });

  it("예제로 시작 → UUID 보드 + 예제 메모 3장 + 그 보드로 이동", async () => {
    await useStorage.getState().init();
    mount();

    fireEvent.click(screen.getByRole("button", { name: "예제로 시작" }));
    await waitFor(() => expect(useWorkspace.getState().boards).toHaveLength(1));

    const state = useWorkspace.getState();
    const board = state.boards[0];
    expect(board.isSystem).toBe(false);
    expect(board.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // 보드 행 저장 뒤 전환은 비동기로 이어진다 — 스냅샷이 아니라 최신 상태를 기다린다.
    await waitFor(() =>
      expect(useWorkspace.getState().currentBoardId).toBe(board.id),
    );
    await waitFor(() => expect(useWorkspace.getState().cards).toHaveLength(3));
  });

  it("빈 보드로 시작 → 카드 없는 새 보드로 이동", async () => {
    await useStorage.getState().init();
    mount();

    fireEvent.click(screen.getByRole("button", { name: "빈 보드로 시작" }));
    await waitFor(() => expect(useWorkspace.getState().boards).toHaveLength(1));

    const board = useWorkspace.getState().boards[0];
    expect(board.isSystem).toBe(false);
    await waitFor(() =>
      expect(useWorkspace.getState().currentBoardId).toBe(board.id),
    );
    expect(useWorkspace.getState().cards).toHaveLength(0);
  });
});
