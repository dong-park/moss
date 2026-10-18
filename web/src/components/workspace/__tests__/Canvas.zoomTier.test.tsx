import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { MIN_SCALE, SYSTEM_BOARD_ID, useWorkspace, zoomTier } from "@/state/workspace";
import { resetCollabStore } from "@/state/collab";

/** PZ-2: 줌 구간(가까이 ≥80%, 보통 ≥40%, 멀리)과 역배율 변수를 world 레이어에 내린다. */
describe("zoomTier", () => {
  it("경계값", () => {
    expect(zoomTier(1.1)).toBe("near");
    expect(zoomTier(0.8)).toBe("near");
    expect(zoomTier(0.79)).toBe("mid");
    expect(zoomTier(0.4)).toBe("mid");
    expect(zoomTier(0.39)).toBe("far");
    expect(zoomTier(MIN_SCALE)).toBe("far");
  });
  it("최소 줌은 25%", () => {
    expect(MIN_SCALE).toBe(0.25);
  });
});

describe("Canvas world 레이어", () => {
  beforeEach(() => {
    resetCollabStore();
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null, currentBoardId: "b1" });
  });
  afterEach(() => {
    resetCollabStore();
    useWorkspace.setState({ cards: [], currentBoardId: SYSTEM_BOARD_ID, viewport: { x: 0, y: 0, scale: 1 } });
  });

  it("배율이 바뀌면 data-zoom-tier와 --zoom-inv가 따라 바뀐다", async () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } });
    const { container } = render(
      <I18nProvider locale="ko">
        <Canvas />
      </I18nProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const world = () => container.querySelector<HTMLElement>("[data-zoom-tier]")!;
    expect(world().dataset.zoomTier).toBe("near");
    expect(world().style.getPropertyValue("--zoom-inv")).toBe("1");

    await act(async () => {
      useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 0.25 } });
    });
    expect(world().dataset.zoomTier).toBe("far");
    expect(world().style.getPropertyValue("--zoom-inv")).toBe("4");
  });
});
