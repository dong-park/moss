import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { useToasts } from "@/state/notifications";

const CANVAS_W = 800;
const CANVAS_H = 600;

let originalGBCR: typeof Element.prototype.getBoundingClientRect;

beforeAll(() => {
  // jsdom의 getBoundingClientRect는 항상 0을 반환한다. Canvas div의 size를
  // 안정적으로 측정시키기 위해 prototype을 덮어쓴다 (모든 element 공통이지만
  // 가상화 로직은 canvasRef만 본다).
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

beforeEach(() => {
  useToasts.setState({ toasts: [] });
});

afterEach(() => {
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { x: 0, y: 0, scale: 1 },
    currentBoardId: SYSTEM_BOARD_ID,
  });
  useToasts.setState({ toasts: [] });
});

function makeCard(id: string, x: number, y: number): Card {
  return { id, kind: "text", x, y, width: 240, content: "" };
}

function mount() {
  return render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
}

describe("FEAT-canvas AC-3 · Canvas 가상화", () => {
  it("viewport 밖 카드는 DOM에 마운트되지 않는다", async () => {
    // 200개 카드: 절반은 viewport 안 (0~800, 0~600 영역), 절반은 viewport 밖 (멀리)
    const cards: Card[] = [];
    for (let i = 0; i < 100; i++) {
      // viewport 안 — 가로 0~700에 흩뿌리기
      cards.push(makeCard(`in-${i}`, (i % 10) * 70, Math.floor(i / 10) * 50));
    }
    for (let i = 0; i < 100; i++) {
      // viewport 한참 밖 — 좌상단 −10000 부근
      cards.push(makeCard(`out-${i}`, -10000 - i, -10000 - i));
    }

    useWorkspace.setState({
      cards,
      currentBoardId: "test-board",
      viewport: { x: 0, y: 0, scale: 1 },
    });

    const { container } = mount();

    // canvasSize는 mount 후 동기 useEffect로 setState. act 안에서 flush.
    await act(async () => {
      await Promise.resolve();
    });

    const cardEls = container.querySelectorAll<HTMLElement>("[data-card-id]");
    const ids = Array.from(cardEls).map((el) => el.dataset.cardId);

    // viewport 안 카드는 전부 마운트
    for (let i = 0; i < 100; i++) {
      expect(ids).toContain(`in-${i}`);
    }
    // viewport 한참 밖 카드는 전부 컬링
    for (let i = 0; i < 100; i++) {
      expect(ids).not.toContain(`out-${i}`);
    }
  });

  it("cards.length가 200을 처음 넘으면 안내 토스트 1회 발생", async () => {
    const many: Card[] = Array.from({ length: 200 }, (_, i) =>
      makeCard(`c-${i}`, (i % 20) * 50, Math.floor(i / 20) * 50),
    );

    useWorkspace.setState({
      cards: many,
      currentBoardId: "test-board",
      viewport: { x: 0, y: 0, scale: 1 },
    });

    mount();
    await act(async () => {
      await Promise.resolve();
    });

    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toMatch(/메모/);
  });

  it("200 미만이면 토스트 발생하지 않는다", async () => {
    const few: Card[] = Array.from({ length: 50 }, (_, i) =>
      makeCard(`c-${i}`, i * 10, 0),
    );

    useWorkspace.setState({
      cards: few,
      currentBoardId: "test-board",
      viewport: { x: 0, y: 0, scale: 1 },
    });

    mount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGBCR;
});
