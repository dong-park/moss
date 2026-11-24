import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { WorkspaceGate } from "@/components/auth/WorkspaceGate";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase, saveSession } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
});

afterEach(() => {
  resetAuthStore();
});

const user = { id: "u1", name: "동환", avatar: null };

function mount() {
  return render(
    <I18nProvider locale="ko">
      <WorkspaceGate>
        <div>WORKSPACE</div>
      </WorkspaceGate>
    </I18nProvider>,
  );
}

/** 게이트가 로그인 화면을 그리던 시절의 카피 — 어떤 상태에서도 다시 나오면 안 된다. */
function expectNoLoginScreen() {
  expect(screen.queryByText("생각을 붙이면,\n연결이 보여요", { normalizer: (s) => s })).toBeNull();
  expect(screen.queryByRole("button", { name: "Google 계정으로 로그인" })).toBeNull();
}

describe("WorkspaceGate · 로그인 없이 워크스페이스를 연다 (local-promise T1)", () => {
  test("세션 복원 전(anonymous·!hydrated)에도 워크스페이스를 그린다 — 빈 화면이 아니다", () => {
    useAuth.setState({ status: "anonymous", hydrated: false });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
  });

  test("복원이 anonymous로 끝나도(hydrated) 워크스페이스다", () => {
    useAuth.setState({ status: "anonymous", hydrated: true });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
  });

  test("authenticated면 워크스페이스를 렌더한다", () => {
    useAuth.setState({ status: "authenticated", hydrated: true, user });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
  });

  test("expired여도 워크스페이스를 렌더한다 (D5-3)", () => {
    useAuth.setState({ status: "expired", hydrated: true, user });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
  });

  test("오프라인이라 hydrated가 서지 않아도 복원된 세션이면 연다 (AC-13)", () => {
    useAuth.setState({
      status: "authenticated",
      hydrated: false,
      user,
      session: { accessToken: "a.b.c", refreshToken: "a.b.c", user },
    });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
  });
});

describe("T12 · 로그아웃해도 벽이 그대로다", () => {
  test("로그아웃으로 anonymous가 돼도 워크스페이스가 남고 로그인 화면은 없다", async () => {
    useAuth.setState({
      status: "authenticated",
      hydrated: true,
      user,
      session: { accessToken: "a.b.c", refreshToken: "a.b.c", user },
    });
    mount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();

    await useAuth.getState().logout();

    await waitFor(() => expect(useAuth.getState().status).toBe("anonymous"));
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
  });
});

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

const NOW = 1_700_000_000_000;

function bootstrapMount() {
  return render(
    <I18nProvider locale="ko">
      <AuthBootstrap />
      <WorkspaceGate>
        <div>WORKSPACE</div>
      </WorkspaceGate>
    </I18nProvider>,
  );
}

describe("T10 · 이미 로그인해 쓰던 사람은 안내 없이 이어 쓴다", () => {
  test("저장된 세션이 복원되는 내내 워크스페이스가 보이고 로그인 화면이 한 번도 없다", async () => {
    const stored = {
      accessToken: makeToken(NOW / 1000 + 600),
      refreshToken: makeToken(NOW / 1000 + 600),
      user,
    };
    await saveSession(stored);
    const api = {
      googleLogin: vi.fn(),
      signup: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
    } as unknown as AuthApi;
    configureAuth({ api, googleIdToken: vi.fn(), now: () => NOW });

    bootstrapMount();

    // 복원 전부터 이미 워크스페이스다 — 빈 화면도 로그인 화면도 아니다.
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(useAuth.getState().user?.id).toBe("u1");
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
    // 토큰이 유효하면 다시 로그인하라고 묻지도, 서버를 부르지도 않는다.
    expect(api.refresh).not.toHaveBeenCalled();
    expect(api.googleLogin).not.toHaveBeenCalled();
  });

  test("저장된 세션이 없으면 anonymous로 끝나고 그래도 워크스페이스이며 네트워크 0건 (AC-1)", async () => {
    const api = {
      googleLogin: vi.fn(),
      signup: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
    } as unknown as AuthApi;
    configureAuth({ api, googleIdToken: vi.fn(), now: () => NOW });

    bootstrapMount();
    expect(screen.getByText("WORKSPACE")).toBeTruthy();

    await waitFor(() => expect(useAuth.getState().hydrated).toBe(true));
    expect(useAuth.getState().status).toBe("anonymous");
    expect(screen.getByText("WORKSPACE")).toBeTruthy();
    expectNoLoginScreen();
    expect(api.refresh).not.toHaveBeenCalled();
    expect(api.googleLogin).not.toHaveBeenCalled();
  });
});
