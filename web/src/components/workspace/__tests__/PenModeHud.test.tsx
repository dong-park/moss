import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { PenModeHud } from "@/components/workspace/PenModeHud";

/**
 * FEAT-pen-mode-ux AC-1: 펜 모드 ON 동안 HUD 상시, OFF 시 사라짐.
 */
function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

beforeEach(() => {
  useWorkspace.setState({ penMode: false });
});

describe("PenModeHud", () => {
  it("펜 모드 OFF면 아무것도 렌더하지 않는다", () => {
    useWorkspace.setState({ penMode: false });
    const { container } = wrap(<PenModeHud />);
    expect(container.firstChild).toBeNull();
  });

  it("펜 모드 ON이면 라벨·해제 안내를 role=status로 상시 보여준다", () => {
    useWorkspace.setState({ penMode: true });
    wrap(<PenModeHud />);
    const status = screen.getByRole("status");
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("펜 모드");
    expect(status.textContent).toContain("Esc 해제");
  });
});
