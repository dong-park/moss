import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { resetCollabStore } from "@/state/collab";

beforeEach(() => {
  resetCollabStore();
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

describe("P2: 커서 발행 좌표 측정", () => {
  it("마우스 이동마다 getBoundingClientRect를 다시 재지 않는다", async () => {
    const { container } = render(
      <I18nProvider locale="ko">
        <Canvas />
      </I18nProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const root = container.querySelector<HTMLElement>('[data-canvas-root="true"]');
    expect(root).toBeTruthy();

    fireEvent.mouseMove(root!, { clientX: 100, clientY: 50 });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
