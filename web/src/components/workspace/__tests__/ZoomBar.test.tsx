import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MAX_SCALE, MIN_SCALE, useWorkspace } from "@/state/workspace";
import { ZoomBar } from "@/components/workspace/ZoomBar";

/**
 * FEAT-canvas-initial-view AC-4: 줌 바의 −는 80%에서, +는 110%에서 비활성화된다.
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
  it("80%에서 −가 비활성, +는 활성", () => {
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

  it("100%에서 − 한 번 → 83%, 두 번 → 80%에 멈춘다", () => {
    useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } });
    const { rerender } = wrap();
    fireEvent.click(btn("축소"));
    expect(useWorkspace.getState().viewport.scale).toBeCloseTo(0.833, 3);

    rerender(
      <I18nProvider locale="ko">
        <ZoomBar />
      </I18nProvider>,
    );
    fireEvent.click(btn("축소"));
    expect(useWorkspace.getState().viewport.scale).toBe(MIN_SCALE);
  });
});
