import { afterEach, describe, expect, it } from "vitest";
import type { EditorView } from "@milkdown/prose/view";
import { getBubbleState, refreshBubble } from "../extensions";

function fakeView(
  empty: boolean,
  coords: { left: number; top: number; bottom: number },
): EditorView {
  return {
    editable: true,
    state: { selection: { from: 1, to: 5, empty } },
    coordsAtPos: () => coords,
  } as unknown as EditorView;
}

function scrollEl(top: number, bottom: number): HTMLElement {
  return {
    getBoundingClientRect: () => ({ top, bottom }),
  } as unknown as HTMLElement;
}

describe("refreshBubble", () => {
  afterEach(() => refreshBubble(scrollEl(0, 100), fakeView(true, { left: 0, top: 0, bottom: 0 })));

  it("범위 안이면 새 좌표로 연다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, { left: 40, top: 100, bottom: 116 }));
    const s = getBubbleState();
    expect(s.open).toBe(true);
    expect(s.left).toBe(40);
    expect(s.top).toBe(100);
  });

  it("범위 밖이면 닫는다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, { left: 40, top: 100, bottom: 116 }));
    refreshBubble(scrollEl(200, 500), fakeView(false, { left: 40, top: 100, bottom: 116 }));
    expect(getBubbleState().open).toBe(false);
  });

  it("빈 선택이면 닫는다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, { left: 40, top: 100, bottom: 116 }));
    refreshBubble(scrollEl(0, 500), fakeView(true, { left: 40, top: 100, bottom: 116 }));
    expect(getBubbleState().open).toBe(false);
  });

  it("범위 밖에서 닫힌 뒤 범위 안 좌표로 다시 부르면 다시 연다", () => {
    const v = fakeView(false, { left: 40, top: 100, bottom: 116 });
    refreshBubble(scrollEl(200, 500), v);
    expect(getBubbleState().open).toBe(false);
    refreshBubble(scrollEl(0, 500), v);
    expect(getBubbleState().open).toBe(true);
  });
});
