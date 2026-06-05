import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import {
  useWorkspace,
  PEN_MIN_WIDTH,
  PEN_MAX_WIDTH,
} from "@/state/workspace";
import { PenToolbar } from "@/components/workspace/PenToolbar";

/**
 * FEAT-pen-mode-ux AC-3: 툴바가 현재 도구(펜/지우개)·굵기를 즉시 반영하고,
 * 클릭이 기존 setPenTool/setPenWidth를 호출한다(신규 액션 없음).
 */
function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

const btn = (name: string) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  useWorkspace.setState({ penMode: true, penTool: "pen", penWidth: 3 });
});

describe("PenToolbar", () => {
  it("펜 모드 OFF면 렌더하지 않는다", () => {
    useWorkspace.setState({ penMode: false });
    const { container } = wrap(<PenToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it("현재 도구를 aria-pressed로 반영한다 (펜 선택 상태)", () => {
    wrap(<PenToolbar />);
    expect(btn("펜").getAttribute("aria-pressed")).toBe("true");
    expect(btn("지우개").getAttribute("aria-pressed")).toBe("false");
  });

  it("지우개 버튼 클릭 → penTool=eraser 로 전환되고 aria-pressed가 따라간다", () => {
    const { rerender } = wrap(<PenToolbar />);
    fireEvent.click(btn("지우개"));
    expect(useWorkspace.getState().penTool).toBe("eraser");
    rerender(
      <I18nProvider locale="ko">
        <PenToolbar />
      </I18nProvider>,
    );
    expect(btn("지우개").getAttribute("aria-pressed")).toBe("true");
  });

  it("굵게/얇게 버튼이 penWidth를 1씩 올리고 내린다", () => {
    wrap(<PenToolbar />);
    fireEvent.click(btn("굵게"));
    expect(useWorkspace.getState().penWidth).toBe(4);
    fireEvent.click(btn("얇게"));
    fireEvent.click(btn("얇게"));
    expect(useWorkspace.getState().penWidth).toBe(2);
  });

  it("최소/최대 굵기에서 해당 버튼이 비활성화된다", () => {
    useWorkspace.setState({ penWidth: PEN_MIN_WIDTH });
    const { rerender } = wrap(<PenToolbar />);
    expect(btn("얇게").disabled).toBe(true);

    useWorkspace.setState({ penWidth: PEN_MAX_WIDTH });
    rerender(
      <I18nProvider locale="ko">
        <PenToolbar />
      </I18nProvider>,
    );
    expect(btn("굵게").disabled).toBe(true);
  });

  // §0 잔여작업: 펜 모드 종료가 Esc 전용이던 문제 — 클릭 종료 수단 제공.
  it("펜 모드 종료 버튼 클릭 → penMode=false 로 빠져나간다", () => {
    wrap(<PenToolbar />);
    expect(useWorkspace.getState().penMode).toBe(true);
    fireEvent.click(btn("펜 모드 종료"));
    expect(useWorkspace.getState().penMode).toBe(false);
  });
});
