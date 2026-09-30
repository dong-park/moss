import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";

vi.mock("../useVirtualizedCards", () => ({
  useVirtualizedCards: vi.fn(() => []),
}));

import { Canvas } from "@/components/workspace/Canvas";
import { useVirtualizedCards } from "../useVirtualizedCards";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { resetCollabStore, useCollab } from "@/state/collab";

const mockVirtualize = vi.mocked(useVirtualizedCards);

beforeEach(() => {
  resetCollabStore();
  mockVirtualize.mockClear();
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { x: 0, y: 0, scale: 1 },
    currentBoardId: "b1",
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

function mount() {
  return render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
}

describe("P1: Canvas 원격 awareness 리렌더 격리", () => {
  it("원격 참여자가 바뀌어도 Canvas 본체는 다시 렌더하지 않는다", async () => {
    mount();
    await act(async () => {
      await Promise.resolve();
    });
    const before = mockVirtualize.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    act(() => {
      useCollab.setState({
        participants: [
          {
            clientId: 2,
            user: { name: "민지", color: "#ff9f0a" },
            cursor: { x: 1, y: 2 },
          },
        ],
      });
    });

    // Canvas가 participants을 구독하면 가상화까지 다시 계산된다 — 구독은
    // 각 원격 레이어로 내려가 있어야 한다.
    expect(mockVirtualize.mock.calls.length).toBe(before);
  });
});
