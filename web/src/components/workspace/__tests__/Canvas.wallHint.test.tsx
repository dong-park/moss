import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";

// 카드 DOM은 이 테스트의 관심사가 아니다 — 가상화만 비우고 Canvas의 렌더 조건
// (isWallEmpty ← 스토어 cards)은 실제 경로로 탄다.
vi.mock("../useVirtualizedCards", () => ({
  useVirtualizedCards: vi.fn(() => []),
}));

import { Canvas } from "@/components/workspace/Canvas";
import { isWallEmpty } from "@/components/workspace/wallEmpty";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { resetCollabStore } from "@/state/collab";

const HINT = "마카를 집거나, 아무 데나 두 번 눌러 포스트잇";

function note(id: string): Card {
  return { id, kind: "text", x: 0, y: 0, width: 200, content: "" };
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
}

beforeEach(() => {
  resetCollabStore();
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { x: 0, y: 0, scale: 1 },
    currentBoardId: SYSTEM_BOARD_ID,
    boardTransitioning: false,
  });
});

afterEach(() => {
  resetCollabStore();
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    currentBoardId: SYSTEM_BOARD_ID,
  });
});

describe("isWallEmpty — 메모도 획도 없을 때만 빈 벽", () => {
  it("카드 0장·획 0개면 비었다", () => {
    expect(isWallEmpty([], 0)).toBe(true);
  });
  it("획이 하나라도 있으면 비지 않았다", () => {
    expect(isWallEmpty([], 1)).toBe(false);
  });
  it("카드가 하나라도 있으면 비지 않았다", () => {
    expect(isWallEmpty([note("a")], 0)).toBe(false);
  });
});

describe("빈 벽 힌트 (Canvas 실제 렌더 조건)", () => {
  it("카드 0장이면 힌트 글자가 정확히 1번 보이고 dialog·button이 없다", async () => {
    mount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByText(HINT)).toHaveLength(1);
    const hint = screen.getByTestId("system-board-empty");
    expect(within(hint).queryAllByRole("dialog")).toHaveLength(0);
    expect(within(hint).queryAllByRole("button")).toHaveLength(0);
    expect(hint.closest('[role="dialog"]')).toBeNull();
  });

  it("힌트의 계산된 pointer-events는 none이다 — 누름을 가로채지 않는다", async () => {
    mount();
    await act(async () => {
      await Promise.resolve();
    });

    const hint = screen.getByTestId("system-board-empty");
    expect(getComputedStyle(hint).pointerEvents).toBe("none");
  });

  it("카드를 더하면 사라지고, 그 카드를 지우면 다시 보인다", async () => {
    mount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(HINT)).not.toBeNull();

    act(() => {
      useWorkspace.setState({ cards: [note("n1")] });
    });
    expect(screen.queryByText(HINT)).toBeNull();

    act(() => {
      useWorkspace.setState({ cards: [] });
    });
    expect(screen.getAllByText(HINT)).toHaveLength(1);
  });

  it("시스템 보드가 아닌 벽에서도 같은 규칙이다", async () => {
    useWorkspace.setState({ currentBoardId: "user-board-1" });
    mount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText(HINT)).toHaveLength(1);

    act(() => {
      useWorkspace.setState({ cards: [note("n1")] });
    });
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("옛 안내 문구는 어디에도 남지 않는다", async () => {
    mount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("조금 더 머무르면 패턴이 보일 거예요")).toBeNull();
  });
});
