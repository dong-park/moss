import { afterEach, describe, expect, it } from "vitest";
import type { EditorView } from "@milkdown/prose/view";
import { getBubbleState, refreshBubble } from "../extensions";

type Coords = { left: number; top: number; bottom: number };

// 선택 시작(from=1)과 끝(to=5) 좌표를 따로 줄 수 있는 가짜 view.
function fakeView(empty: boolean, start: Coords, end: Coords = start): EditorView {
  return {
    editable: true,
    state: { selection: { from: 1, to: 5, empty } },
    coordsAtPos: (pos: number) => (pos === 1 ? start : end),
  } as unknown as EditorView;
}

function scrollEl(top: number, bottom: number, left = 0, right = 1000): HTMLElement {
  return {
    getBoundingClientRect: () => ({ top, bottom, left, right }),
  } as unknown as HTMLElement;
}

const line = (top: number, left = 40): Coords => ({ left, top, bottom: top + 16 });

describe("refreshBubble", () => {
  afterEach(() => refreshBubble(scrollEl(0, 100), fakeView(true, line(0))));

  it("범위 안이면 선택 시작 위에 새 좌표로 연다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, line(100)));
    const s = getBubbleState();
    expect(s.open).toBe(true);
    expect(s.left).toBe(40);
    expect(s.top).toBe(100);
    expect(s.placement).toBe("above");
  });

  it("선택이 통째로 위로 나가면 닫는다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, line(100)));
    refreshBubble(scrollEl(200, 500), fakeView(false, line(100)));
    expect(getBubbleState().open).toBe(false);
  });

  it("선택이 통째로 아래로 나가면 닫는다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, line(600)));
    expect(getBubbleState().open).toBe(false);
  });

  it("빈 선택이면 닫는다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, line(100)));
    refreshBubble(scrollEl(0, 500), fakeView(true, line(100)));
    expect(getBubbleState().open).toBe(false);
  });

  it("끝이 아래로 넘쳐도 시작이 보이면 시작 위에 연다", () => {
    refreshBubble(scrollEl(0, 500), fakeView(false, line(480), line(900)));
    expect(getBubbleState().open).toBe(true);
    expect(getBubbleState().top).toBe(480);
    expect(getBubbleState().placement).toBe("above");
  });

  it("시작이 위로 나가고 끝이 보이면 스크롤 영역 위 끝 안쪽에 붙인다", () => {
    // 스크롤한 채 전체 선택(Cmd+A)하거나, B가 낸 scrollIntoView로 시작이 밀려 올라간 경우.
    refreshBubble(scrollEl(97, 837), fakeView(false, line(-400), line(300)));
    const s = getBubbleState();
    expect(s.open).toBe(true);
    expect(s.top).toBe(97);
    expect(s.placement).toBe("below");
  });

  it("시작이 위로, 끝이 아래로 넘쳐 선택이 보이는 범위를 덮어도 연다", () => {
    refreshBubble(scrollEl(97, 837), fakeView(false, line(-400), line(2000)));
    expect(getBubbleState().open).toBe(true);
    expect(getBubbleState().placement).toBe("below");
  });

  it("가로 스크롤로 선택이 통째로 왼쪽 밖이면 닫는다", () => {
    refreshBubble(scrollEl(0, 500, 42, 558), fakeView(false, line(100, -176)));
    expect(getBubbleState().open).toBe(false);
  });

  it("가로 범위로 스크롤 영역 좌우를 넘긴다(당기기는 BubbleMenuHost가 버블 폭으로 한다)", () => {
    refreshBubble(scrollEl(0, 500, 42, 558), fakeView(false, line(100, 20), line(100, 60)));
    const s = getBubbleState();
    expect(s.open).toBe(true);
    expect(s.left).toBe(40);
    expect(s.minLeft).toBe(42);
    expect(s.maxLeft).toBe(558);
  });

  it("여러 줄 선택은 양 끝이 왼쪽 밖이어도 가운데 줄이 보이므로 닫지 않는다", () => {
    refreshBubble(scrollEl(0, 500, 42, 558), fakeView(false, line(100, -132), line(148, -82)));
    expect(getBubbleState().open).toBe(true);
  });

  it("시작이 위 끝 바로 아래라 위에 버블 자리가 없으면 첫 줄 바로 아래로 뒤집는다", () => {
    refreshBubble(scrollEl(97, 837), fakeView(false, line(99)));
    const s = getBubbleState();
    expect(s.open).toBe(true);
    expect(s.placement).toBe("below");
    expect(s.top).toBe(115);
  });

  it("범위 밖에서 닫힌 뒤 범위 안 좌표로 다시 부르면 다시 연다", () => {
    const v = fakeView(false, line(100));
    refreshBubble(scrollEl(200, 500), v);
    expect(getBubbleState().open).toBe(false);
    refreshBubble(scrollEl(0, 500), v);
    expect(getBubbleState().open).toBe(true);
  });
});
