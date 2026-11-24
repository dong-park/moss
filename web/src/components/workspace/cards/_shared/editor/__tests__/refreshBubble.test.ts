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

// 제목 입력(data-memo-title-input)이 스크롤 영역 안 맨 위에 있는 펼친 창.
function areaWithTitle(
  area: { top: number; bottom: number },
  title: { top: number; bottom: number },
): HTMLElement {
  const titleEl = { getBoundingClientRect: () => title };
  return {
    getBoundingClientRect: () => ({ ...area, left: 0, right: 1000 }),
    querySelector: (sel: string) => (sel === "[data-memo-title-input]" ? titleEl : null),
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
  });

  it("시작이 위로 나가면 보이는 부분 맨 위(스크롤 영역 위 끝) 위에 띄운다", () => {
    // 스크롤한 채 전체 선택(Cmd+A)하거나, B가 낸 scrollIntoView로 시작이 밀려 올라간 경우.
    // 아래로 뒤집지 않는다 — 뒤집으면 보이는 첫 줄들을 덮어 클릭을 가로챈다.
    refreshBubble(scrollEl(97, 837), fakeView(false, line(-400), line(300)));
    const s = getBubbleState();
    expect(s.open).toBe(true);
    expect(s.top).toBe(97);
  });

  it("시작이 위로, 끝이 아래로 넘쳐 선택이 보이는 범위를 덮어도 연다", () => {
    refreshBubble(scrollEl(97, 837), fakeView(false, line(-400), line(2000)));
    expect(getBubbleState().open).toBe(true);
    expect(getBubbleState().top).toBe(97);
  });

  it("위 끝 바로 아래 선택도 아래로 뒤집지 않고 시작 위에 띄운다", () => {
    refreshBubble(scrollEl(97, 837), fakeView(false, line(99)));
    expect(getBubbleState().open).toBe(true);
    expect(getBubbleState().top).toBe(99);
  });

  it("메모 첫 줄을 고르면 버블이 제목 입력을 덮지 않게 제목 위로 올린다", () => {
    // 스크롤 0: 제목 입력 97~127, 본문 첫 줄 133. 시작 위(93~127)에 띄우면 제목을 덮는다.
    const area = areaWithTitle({ top: 97, bottom: 837 }, { top: 97, bottom: 127 });
    refreshBubble(area, fakeView(false, line(133)));
    expect(getBubbleState().top).toBe(97);
    // 제목에서 충분히 떨어진 줄은 그대로 시작 위다.
    refreshBubble(area, fakeView(false, line(300)));
    expect(getBubbleState().top).toBe(300);
  });

  it("제목이 반쯤 스크롤돼 걸려 있으면 보이는 부분 위(스크롤 영역 위 끝)로 올린다", () => {
    const area = areaWithTitle({ top: 97, bottom: 837 }, { top: 80, bottom: 110 });
    refreshBubble(area, fakeView(false, line(115)));
    expect(getBubbleState().top).toBe(97);
  });

  it("제목이 위로 다 나가 안 보이면 제목을 피하지 않는다", () => {
    const area = areaWithTitle({ top: 97, bottom: 837 }, { top: 40, bottom: 70 });
    refreshBubble(area, fakeView(false, line(120)));
    expect(getBubbleState().top).toBe(120);
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

  it("줄 끝까지 고른 한 줄 선택은 끝 좌표를 줄 끝(side -1)으로 읽어 한 줄로 판정한다", () => {
    // 끝(pos 5)이 줄바꿈 지점: 기본 side는 다음 줄 머리, side -1은 이 줄 끝.
    const v = {
      editable: true,
      state: { selection: { from: 1, to: 5, empty: false } },
      coordsAtPos: (pos: number, side?: number) =>
        pos === 1
          ? line(100, 690)
          : side === -1
            ? line(100, 736)
            : line(121, 9),
    } as unknown as EditorView;
    // 선택(690~736)이 스크롤 영역(42~558) 오른쪽 밖이면 한 줄 선택이라 닫는다.
    refreshBubble(scrollEl(0, 500, 42, 558), v);
    expect(getBubbleState().open).toBe(false);
    // 보이면 가로 중심이 선택 위(713)다. 다음 줄 머리 쪽으로 끌리지 않는다.
    refreshBubble(scrollEl(0, 500, 0, 1000), v);
    expect(getBubbleState().open).toBe(true);
    expect(getBubbleState().left).toBe(713);
  });

  it("범위 밖에서 닫힌 뒤 범위 안 좌표로 다시 부르면 다시 연다", () => {
    const v = fakeView(false, line(100));
    refreshBubble(scrollEl(200, 500), v);
    expect(getBubbleState().open).toBe(false);
    refreshBubble(scrollEl(0, 500), v);
    expect(getBubbleState().open).toBe(true);
  });
});
