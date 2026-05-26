import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { BoardPicker } from "@/components/workspace/BoardPicker";
import { useBoardShortcuts } from "@/components/workspace/useBoardShortcuts";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

let originalStorage: PropertyDescriptor | undefined;

function Mount() {
  useBoardShortcuts();
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
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("FEAT-boards AC-3 · 보드 단축키", () => {
  it("Cmd+N → templatePickerOpen=true", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<Mount />);

    expect(useWorkspace.getState().templatePickerOpen).toBe(false);
    fireEvent.keyDown(window, { key: "n", code: "KeyN", metaKey: true });
    expect(useWorkspace.getState().templatePickerOpen).toBe(true);
  });

  it("Cmd+Shift+N → 보드 단축키는 무시 (FEAT-capture 영역)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<Mount />);

    fireEvent.keyDown(window, {
      key: "n",
      code: "KeyN",
      metaKey: true,
      shiftKey: true,
    });
    expect(useWorkspace.getState().templatePickerOpen).toBe(false);
  });

  it("Cmd+B → 시스템 보드 ↔ 마지막 사용자 보드 토글", async () => {
    await useStorage.getState().init();
    const id = await useWorkspace.getState().createBoard("a");
    await new Promise((r) => setTimeout(r, 250));
    expect(useWorkspace.getState().currentBoardId).toBe(id);

    render(<Mount />);
    fireEvent.keyDown(window, { key: "b", code: "KeyB", metaKey: true });
    await new Promise((r) => setTimeout(r, 250));
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);

    fireEvent.keyDown(window, { key: "b", code: "KeyB", metaKey: true });
    await new Promise((r) => setTimeout(r, 250));
    expect(useWorkspace.getState().currentBoardId).toBe(id);
  });

  it("Cmd+B — 사용자 보드 없으면 no-op", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    render(<Mount />);

    fireEvent.keyDown(window, { key: "b", code: "KeyB", metaKey: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
  });

  it("Cmd+P → 트리거 클릭 시뮬레이션 (드롭다운 열림)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const triggerClick = vi.fn();
    render(
      <I18nProvider locale="ko">
        <>
          <Mount />
          <BoardPicker />
          {/* 모의 트리거: 실제 DOM 셀렉터가 잡아주는지 검증을 위해 BoardPicker도 함께 마운트 */}
        </>
      </I18nProvider>,
    );

    // 실제 DOM에서 data-board-picker-trigger 요소가 존재해야 함
    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-board-picker-trigger]",
    );
    expect(trigger).toBeTruthy();
    // click 핸들러 patch
    if (trigger) trigger.addEventListener("click", triggerClick);

    fireEvent.keyDown(window, { key: "p", code: "KeyP", metaKey: true });
    expect(triggerClick).toHaveBeenCalled();
  });
});
