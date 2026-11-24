import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";

// first-wall T4 — "이 벽을 불러온 직후 한 번"만 fit을 판정한다. 빈 벽으로 불러왔으면
// 그 벽에서는 fit이 소진돼, 사용자가 만든 첫 카드가 뷰포트를 옮기지 않는다.

const CANVAS_W = 800;
const CANVAS_H = 600;
const HOME = { x: 0, y: 0, scale: 1 };

let originalGBCR: typeof Element.prototype.getBoundingClientRect;

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

function resetStore() {
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { ...HOME },
    currentBoardId: SYSTEM_BOARD_ID,
    bootstrapComplete: true,
    viewSettledBoardIds: [],
  });
}

beforeEach(resetStore);
afterEach(() => {
  resetStore();
  useWorkspace.setState({ bootstrapComplete: false });
});

function farCard(id: string, x = 2000, y = 1500): Card {
  return { id, kind: "text", x, y, width: 240, content: "" };
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("first-wall T4 · 최초 fit은 벽을 불러온 직후 한 번만 판정한다", () => {
  it("빈 벽에서 첫 카드를 만들어도 뷰포트(pan/zoom)가 그대로다", async () => {
    mount();
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(HOME);

    // 사용자가 (300,220)에서 두 번 눌러 만든 첫 카드 — 월드 좌표 그대로.
    act(() => {
      useWorkspace.setState({ cards: [{ ...farCard("first", 300, 220) }] });
    });
    await flush();

    expect(useWorkspace.getState().viewport).toEqual(HOME);
    // 빈 벽으로 불러왔다 — 이 벽의 화면은 이미 정해진 것으로 본다(fit이 소진됐다).
    expect(useWorkspace.getState().viewSettledBoardIds).toContain(SYSTEM_BOARD_ID);
  });

  it("빈 벽에서 둘째·셋째 카드를 만들어도 뷰포트가 그대로다", async () => {
    mount();
    await flush();
    act(() => {
      useWorkspace.setState({ cards: [farCard("a", 300, 220)] });
    });
    await flush();
    act(() => {
      useWorkspace.setState({
        cards: [farCard("a", 300, 220), farCard("b", 2400, 1800)],
      });
    });
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(HOME);
  });

  it("카드가 있는 벽을 열면 fit이 한 번 돈다", async () => {
    useWorkspace.setState({ cards: [farCard("a")] });
    mount();
    await flush();

    const fitted = useWorkspace.getState().viewport;
    expect(fitted).not.toEqual(HOME);
    expect(useWorkspace.getState().viewSettledBoardIds).toContain(SYSTEM_BOARD_ID);

    // 이후 카드가 늘어도 다시 돌지 않는다(한 번뿐).
    act(() => {
      useWorkspace.setState({ cards: [farCard("a"), farCard("b", -3000, -2000)] });
    });
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(fitted);
  });

  it("부팅이 끝나기 전의 빈 카드 목록은 판정하지 않는다 — 불러온 카드에 fit이 돈다", async () => {
    useWorkspace.setState({ bootstrapComplete: false });
    mount();
    await flush();
    expect(useWorkspace.getState().viewSettledBoardIds).toEqual([]);

    act(() => {
      useWorkspace.setState({ cards: [farCard("a")], bootstrapComplete: true });
    });
    await flush();
    expect(useWorkspace.getState().viewport).not.toEqual(HOME);
  });

  it("벽을 바꾸면 다시 판정한다 — 빈 벽에서 카드 있는 벽으로 가면 fit, 새 빈 벽에서는 안 돈다", async () => {
    mount();
    await flush();
    // 빈 벽 A: 소진.
    expect(useWorkspace.getState().viewSettledBoardIds).toContain(SYSTEM_BOARD_ID);

    // 카드 있는 벽 B로 전환(setCurrentBoard는 currentBoardId·cards·viewport를 한 번에 바꾼다).
    act(() => {
      useWorkspace.setState({
        currentBoardId: "wall-b",
        cards: [farCard("b1")],
        viewport: { ...HOME },
      });
    });
    await flush();
    const fittedB = useWorkspace.getState().viewport;
    expect(fittedB).not.toEqual(HOME);

    // 또 다른 빈 벽 C로 전환 — 다시 판정, 빈 벽이라 소진. 첫 카드가 뷰포트를 옮기지 않는다.
    act(() => {
      useWorkspace.setState({
        currentBoardId: "wall-c",
        cards: [],
        viewport: { ...HOME },
      });
    });
    await flush();
    act(() => {
      useWorkspace.setState({ cards: [farCard("c1", 300, 220)] });
    });
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(HOME);
  });

  it("표↔캔버스로 다시 마운트돼도 빈 벽 판정이 남아, 그사이 만든 카드로 fit이 돌지 않는다", async () => {
    const first = mount();
    await flush();
    first.unmount();

    useWorkspace.setState({ cards: [farCard("a", 300, 220)] });
    mount();
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(HOME);
  });

  it("검색 점프(panToCard) 한 번이 다른 벽의 첫 fit을 막지 않는다 (W7)", async () => {
    // 벽 A에서 검색 점프로 화면을 정했다.
    useWorkspace.setState({ cards: [farCard("a1", 300, 220)], currentBoardId: "wall-a" });
    mount();
    await flush();
    act(() => useWorkspace.getState().panToCard("a1", { width: CANVAS_W, height: CANVAS_H }));
    await flush();
    expect(useWorkspace.getState().viewSettledBoardIds).toContain("wall-a");

    // 카드가 멀리 있는 벽 B로 간다 — 이 벽은 아직 화면을 정한 적이 없으니 fit이 돈다.
    act(() => {
      useWorkspace.setState({
        currentBoardId: "wall-b",
        cards: [farCard("b1", 4000, 3000)],
        viewport: { ...HOME },
      });
    });
    await flush();
    expect(useWorkspace.getState().viewport).not.toEqual(HOME);
    expect(useWorkspace.getState().viewSettledBoardIds).toContain("wall-b");
  });
});
