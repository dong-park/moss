import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MAX_SCALE, MIN_SCALE, useWorkspace } from "@/state/workspace";
import { ZoomBar } from "@/components/workspace/ZoomBar";
import { zoomBottom } from "@/design/canvasControls";

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

/**
 * 컴포넌트가 넣은 inline style은 jsdom CSSOM을 한 번 거쳐 직렬화된다
 * (env() 폴백이 `env(0px * , * …)`로 재배열됨). 같은 round-trip을 기대값에도 적용해
 * 의도한 원문(오프셋 84/20 + 안전영역 폴백 전체)을 그대로 비교한다. 컴포넌트는 손대지 않는다.
 */
function asCssBottom(value: string): string {
  const el = document.createElement("div");
  el.style.bottom = value;
  return el.style.bottom;
}

beforeEach(() => {
  useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } });
});

it("keeps the tablet zoom row above the full dock and restores desktop placement on resize", () => {
  const original = window.innerWidth;
  try {
    window.innerWidth = 820;
    const { container } = wrap();
    const zoom = container.querySelector<HTMLElement>('[data-canvas-control="zoom"]')!;
    expect(zoom.style.bottom).toBe(asCssBottom(`calc(${zoomBottom}px + env(safe-area-inset-bottom, 0px))`));
    act(() => { window.innerWidth = 1280; window.dispatchEvent(new Event("resize")); });
    expect(zoom.style.bottom).toBe(asCssBottom("calc(20px + env(safe-area-inset-bottom, 0px))"));
  } finally { window.innerWidth = original; }
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
  const privacy = document.createElement("div");
  privacy.dataset.canvasControl = "privacy";
  privacy.getBoundingClientRect = () => ({ top: 64, bottom: 108 }) as DOMRect;
  root.appendChild(privacy);
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
