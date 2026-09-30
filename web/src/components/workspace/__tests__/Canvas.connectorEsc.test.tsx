import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";

/* FEAT-connectors 회귀: 연결 드래그 중 Esc는 드래프트 취소만 해야 하고,
 * 서브 보드에서 부모 보드로 튕기면 안 된다(Canvas window keydown 선점 버그). */

const CANVAS_W = 800;
const CANVAS_H = 600;

let originalGBCR: typeof Element.prototype.getBoundingClientRect;
let originalGoToParent: ReturnType<typeof useWorkspace.getState>["goToParent"];

beforeAll(() => {
  originalGBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: CANVAS_W,
      bottom: CANVAS_H,
      width: CANVAS_W,
      height: CANVAS_H,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGBCR;
});

beforeEach(() => {
  originalGoToParent = useWorkspace.getState().goToParent;
});

afterEach(() => {
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    connectionDraft: null,
    currentBoardId: SYSTEM_BOARD_ID,
    goToParent: originalGoToParent,
  });
});

describe("FEAT-connectors · Canvas Esc 우선순위", () => {
  it("연결 드래프트가 있으면 Esc가 부모 보드로 올라가지 않는다", () => {
    const goToParent = vi.fn(async () => {});
    useWorkspace.setState({
      currentBoardId: "child",
      connectionDraft: {
        sourceId: "a",
        sourceSide: "right",
        pointer: { x: 0, y: 0 },
        targetId: null,
        targetSide: null,
      },
      goToParent,
    });

    render(
      <I18nProvider locale="ko">
        <Canvas />
      </I18nProvider>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(goToParent).not.toHaveBeenCalled();
    expect(useWorkspace.getState().currentBoardId).toBe("child");
  });
});
