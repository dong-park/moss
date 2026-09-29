import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { gateView, WorkspaceGate } from "@/components/auth/WorkspaceGate";
import { resetAuthStore, useAuth } from "@/state/auth/store";

beforeEach(() => {
  resetAuthStore();
});

afterEach(() => {
  resetAuthStore();
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <WorkspaceGate>
        <div>WORKSPACE</div>
      </WorkspaceGate>
    </I18nProvider>,
  );
}

describe("gateView · 복원 전후 판정 (AC-4, D5-3)", () => {
  test("저장된 세션 복원 전(anonymous)에는 온보딩도 캔버스도 아니다", () => {
    expect(gateView("anonymous", false)).toBe("loading");
    expect(gateView("anonymous", true)).toBe("onboarding");
  });

  test("세션이 복원됐으면 hydrated와 무관하게 워크스페이스", () => {
    expect(gateView("authenticated", true)).toBe("workspace");
    expect(gateView("expired", true)).toBe("workspace");
    // D5-3: 오프라인에서 갱신이 실패해 hydrated가 서지 않아도 계속 연다.
    expect(gateView("authenticated", false)).toBe("workspace");
    expect(gateView("expired", false)).toBe("workspace");
  });
});

describe("WorkspaceGate 렌더", () => {
  test("복원 전에는 빈 화면", () => {
    useAuth.setState({ status: "anonymous", hydrated: false });
    const { container } = mount();
    expect(container.textContent).toBe("");
  });

  test("anonymous면 온보딩만, 워크스페이스는 없다", () => {
    useAuth.setState({ status: "anonymous", hydrated: true });
    mount();
    expect(screen.getByText("moss에 오신 것을 환영해요")).toBeTruthy();
    expect(screen.queryByText("WORKSPACE")).toBeNull();
  });

  test("authenticated면 워크스페이스를 렌더한다", () => {
    useAuth.setState({
      status: "authenticated",
      hydrated: true,
      user: { id: "u1", name: "동환", avatar: null },
    });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expect(screen.queryByText("moss에 오신 것을 환영해요")).toBeNull();
  });

  test("expired여도 워크스페이스를 렌더한다 (D5-3)", () => {
    useAuth.setState({
      status: "expired",
      hydrated: true,
      user: { id: "u1", name: "동환", avatar: null },
    });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
  });

  test("오프라인이라 hydrated가 서지 않아도 복원된 세션이면 연다 (AC-13)", () => {
    useAuth.setState({
      status: "authenticated",
      hydrated: false,
      user: { id: "u1", name: "동환", avatar: null },
      session: {
        accessToken: "a.b.c",
        refreshToken: "a.b.c",
        user: { id: "u1", name: "동환", avatar: null },
      },
    });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expect(screen.queryByText("moss에 오신 것을 환영해요")).toBeNull();
  });
});
