import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { EditorView } from "@milkdown/prose/view";

vi.mock("../BubbleToolbar", () => ({
  memoBubbleItems: [
    { id: "bold", label: "B", aria: "굵게", isActive: () => false, run: () => {} },
  ],
}));

import { refreshBubble } from "../extensions";
import { BubbleMenuHost } from "../BubbleMenuHost";

const view = {
  editable: true,
  state: { selection: { from: 1, to: 5, empty: false } },
  coordsAtPos: () => ({ left: 40, top: 100, bottom: 116 }),
} as unknown as EditorView;

afterEach(() => {
  act(() =>
    refreshBubble(
      { getBoundingClientRect: () => ({ top: 0, bottom: 500 }) } as HTMLElement,
      { ...view, state: { selection: { empty: true } } } as unknown as EditorView,
    ),
  );
  cleanup();
});

describe("BubbleMenuHost", () => {
  it("열린 버블은 pointer-events:auto라 모달 오버레이로 클릭이 뚫리지 않는다", () => {
    render(<BubbleMenuHost />);
    act(() =>
      refreshBubble(
        { getBoundingClientRect: () => ({ top: 0, bottom: 500 }) } as HTMLElement,
        view,
      ),
    );
    const el = document.querySelector("[data-bubble-toolbar]") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.pointerEvents).toBe("auto");
  });
});
