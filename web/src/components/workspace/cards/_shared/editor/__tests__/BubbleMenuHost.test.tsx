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

type Coords = { left: number; top: number; bottom: number };

function viewAt(start: Coords, end: Coords = start): EditorView {
  return {
    editable: true,
    state: { selection: { from: 1, to: 5, empty: false } },
    coordsAtPos: (pos: number) => (pos === 1 ? start : end),
  } as unknown as EditorView;
}

const area = (top: number, bottom: number) =>
  ({ getBoundingClientRect: () => ({ top, bottom, left: -5000, right: 5000 }) }) as HTMLElement;

const bubble = () => document.querySelector("[data-bubble-toolbar]") as HTMLElement | null;

afterEach(() => {
  act(() =>
    refreshBubble(area(0, 500), {
      ...viewAt({ left: 0, top: 0, bottom: 0 }),
      state: { selection: { empty: true } },
    } as unknown as EditorView),
  );
  cleanup();
});

describe("BubbleMenuHost", () => {
  it("열린 버블은 pointer-events:auto라 모달 오버레이로 클릭이 뚫리지 않는다", () => {
    render(<BubbleMenuHost />);
    act(() => refreshBubble(area(0, 500), viewAt({ left: 40, top: 100, bottom: 116 })));
    expect(bubble()).not.toBeNull();
    expect(bubble()!.style.pointerEvents).toBe("auto");
  });

  it("선택 시작 위에 띄울 때는 위로 올리고, 시작이 위로 나가면 영역 안쪽 아래로 붙인다", () => {
    render(<BubbleMenuHost />);
    act(() => refreshBubble(area(0, 500), viewAt({ left: 40, top: 100, bottom: 116 })));
    expect(bubble()!.dataset.placement).toBe("above");
    expect(bubble()!.className).toContain("-translate-y-full");
    expect(bubble()!.style.top).toBe("94px");

    act(() =>
      refreshBubble(
        area(97, 837),
        viewAt({ left: 40, top: -400, bottom: -384 }, { left: 40, top: 300, bottom: 316 }),
      ),
    );
    expect(bubble()!.dataset.placement).toBe("below");
    expect(bubble()!.className).not.toContain("-translate-y-full");
    expect(bubble()!.style.top).toBe("103px");
  });

  it("버블이 화면 왼쪽 밖으로 나가지 않게 left를 8px 안으로 당긴다", () => {
    render(<BubbleMenuHost />);
    act(() => refreshBubble(area(0, 500), viewAt({ left: -176, top: 100, bottom: 116 })));
    expect(bubble()!.style.left).toBe("8px");
  });
});
