import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MAX_SCALE, MIN_SCALE, useWorkspace } from "@/state/workspace";
import { ZoomBar } from "@/components/workspace/ZoomBar";

/**
 * FEAT-canvas-initial-view AC-4: 줌 바의 −는 최소 줌(PZ-2: 25%)에서, +는 110%에서 비활성화된다.
 */
function wrap() {
  return render(
    <I18nProvider locale="ko">
      <ZoomBar />
    </I18nProvider>,
  );
}

const btn = (name: string) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } });
});

describe("ZoomBar — 줌 한계", () => {
  it("최소 줌에서 −가 비활성, +는 활성", () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: MIN_SCALE } });
    wrap();
    expect(btn("축소").disabled).toBe(true);
    expect(btn("확대").disabled).toBe(false);
  });

  it("110%에서 +가 비활성, −는 활성", () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: MAX_SCALE } });
    wrap();
    expect(btn("확대").disabled).toBe(true);
    expect(btn("축소").disabled).toBe(false);
  });

  it("100%에서 − 한 번 → 83%", () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } });
    wrap();
    fireEvent.click(btn("축소"));
    expect(useWorkspace.getState().viewport.scale).toBeCloseTo(0.833, 3);
  });

  it("28%에서 − 한 번 → 25%에 멈춘다", () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 0.28 } });
    wrap();
    fireEvent.click(btn("축소"));
    expect(useWorkspace.getState().viewport.scale).toBe(MIN_SCALE);
  });
});


it("overview reserves measured safe-area controls relative to the canvas", () => {
  const root = document.createElement("div");
  root.dataset.canvasRoot = "true";
  root.getBoundingClientRect = () => ({ width: 390, height: 700, bottom: 750 }) as DOMRect;
  document.body.appendChild(root);
  const fit = vi.spyOn(useWorkspace.getState(), "fitAllCards");
  const { container } = wrap();
  const zoom = container.querySelector('[data-canvas-control="zoom"]')!;
  vi.spyOn(zoom, "getBoundingClientRect").mockReturnValue({ top: 565, bottom: 617 } as DOMRect);
  try {
    fireEvent.click(btn("전체 보기"));
    expect(fit).toHaveBeenCalledWith({ width: 390, height: 700,
      insets: { top: 64, left: 24, right: 24, bottom: 197 } });
  } finally {
    fit.mockRestore();
    root.remove();
  }
});

it("overview zoom increases gradually below the normal minimum", () => {
  useWorkspace.setState({ viewport: { x: 20, y: 30, scale: 0.02 } });
  wrap();
  fireEvent.click(btn("확대"));
  expect(useWorkspace.getState().viewport.scale).toBeCloseTo(0.024);
});

it("wheel zoom out preserves a below-minimum overview instead of jumping in", () => {
  useWorkspace.setState({ viewport: { x: 20, y: 30, scale: 0.02 } });
  useWorkspace.getState().zoomAt(0.9, 100, 100);
  expect(useWorkspace.getState().viewport).toEqual({ x: 20, y: 30, scale: 0.02 });
});
