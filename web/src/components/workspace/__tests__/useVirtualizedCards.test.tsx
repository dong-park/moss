import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useVirtualizedCards,
  _virtualizationInternals,
} from "@/components/workspace/useVirtualizedCards";
import type { Card, Viewport } from "@/state/workspace";

const { OVERSCAN_SCREEN_PX, ESTIMATED_CARD_HEIGHT } = _virtualizationInternals;

function makeCard(id: string, x: number, y: number, width = 240): Card {
  return { id, kind: "text", x, y, width, content: "" };
}

const identityViewport: Viewport = { x: 0, y: 0, scale: 1 };

describe("useVirtualizedCards", () => {
  it("canvasSize=0이면 전체를 반환한다 (첫 페인트 안정)", () => {
    const cards = [makeCard("a", 0, 0), makeCard("b", 99999, 99999)];
    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: identityViewport,
        canvasSize: { width: 0, height: 0 },
      }),
    );
    expect(result.current).toHaveLength(2);
  });

  it("viewport 안 카드만 통과시킨다 (scale=1, pan=0)", () => {
    const cards = [
      makeCard("inside", 100, 100),
      // overscan 200px + 카드폭 240 + 카드 estimated height 800 보다 멀리
      makeCard("far-right", 5000, 5000),
      makeCard("far-bottom-left", -5000, 5000),
    ];
    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: identityViewport,
        canvasSize: { width: 800, height: 600 },
      }),
    );
    const ids = result.current.map((c) => c.id);
    expect(ids).toContain("inside");
    expect(ids).not.toContain("far-right");
    expect(ids).not.toContain("far-bottom-left");
  });

  it("overscan 영역의 카드는 포함된다", () => {
    // canvas 800x600. overscan = 200. 카드 x=900 → 카드 우측 끝 1140
    // worldRight = 800 + 200 = 1000. 카드 left(900) < 1000 → 통과
    const cards = [
      makeCard("just-outside-within-overscan", 900, 100),
      // 카드 left=1200 → > 1000 (worldRight 포함 overscan) → 제외
      makeCard("beyond-overscan", 1200, 100),
    ];
    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: identityViewport,
        canvasSize: { width: 800, height: 600 },
      }),
    );
    const ids = result.current.map((c) => c.id);
    expect(ids).toContain("just-outside-within-overscan");
    expect(ids).not.toContain("beyond-overscan");
  });

  it("scale<1(줌아웃)에서 visible 영역이 넓어진다", () => {
    // scale=0.5에서 worldRight = 800/0.5 = 1600. overscan 200/0.5 = 400
    // 카드 x=1500 → left<2000 → 통과
    const cards = [makeCard("zoom-out-visible", 1500, 1500)];
    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: { x: 0, y: 0, scale: 0.5 },
        canvasSize: { width: 800, height: 600 },
      }),
    );
    expect(result.current.map((c) => c.id)).toContain("zoom-out-visible");
  });

  it("pan으로 viewport가 움직이면 다른 카드가 보인다", () => {
    const cards = [
      makeCard("origin", 0, 0),
      makeCard("right-area", 1500, 0),
    ];
    // viewport.x = -1400 (오른쪽으로 1400 pan)
    // worldLeft = 1400, worldRight = 1400 + 800 = 2200
    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: { x: -1400, y: 0, scale: 1 },
        canvasSize: { width: 800, height: 600 },
      }),
    );
    const ids = result.current.map((c) => c.id);
    expect(ids).toContain("right-area");
    expect(ids).not.toContain("origin");
  });

  it("editingId 카드는 viewport 밖이어도 강제로 포함된다", () => {
    const cards = [
      makeCard("offscreen-editing", 9999, 9999),
      makeCard("offscreen-idle", 9999, 9998),
    ];
    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: identityViewport,
        canvasSize: { width: 800, height: 600 },
        editingId: "offscreen-editing",
      }),
    );
    const ids = result.current.map((c) => c.id);
    expect(ids).toContain("offscreen-editing");
    expect(ids).not.toContain("offscreen-idle");
  });

  it("200개 카드 중 viewport 안 카드만 남긴다", () => {
    // 20×20 = 400 카드 격자, 250px 간격. 카드 width 240, est height 800.
    // viewport 0~800 x 0~600 + overscan 200 → world 0~1000 x 0~800
    const cards: Card[] = [];
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        cards.push(makeCard(`c-${i}-${j}`, i * 250, j * 250));
      }
    }
    expect(cards.length).toBe(400);

    const { result } = renderHook(() =>
      useVirtualizedCards({
        cards,
        viewport: identityViewport,
        canvasSize: { width: 800, height: 600 },
      }),
    );
    // 절반 이상이 컬링되는지 sanity check
    expect(result.current.length).toBeLessThan(cards.length / 2);
    // viewport 안 좌상단은 반드시 포함
    expect(result.current.map((c) => c.id)).toContain("c-0-0");
  });

  it("상수 노출이 합리적 범위에 있다", () => {
    expect(OVERSCAN_SCREEN_PX).toBeGreaterThan(0);
    expect(ESTIMATED_CARD_HEIGHT).toBeGreaterThan(200);
  });
});
