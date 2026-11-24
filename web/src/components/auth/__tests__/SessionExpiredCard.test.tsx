import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { AuthSessionOverlay } from "@/components/auth/SessionExpiredCard";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase, loadSession, saveSession } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import type { AuthSession } from "@/state/auth/types";
import { installFakeGoogle, resetFakeGoogle, stubClientWidth, type FakeGoogle } from "./fakeGoogle";

const NOW = 1_700_000_000_000;

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

const fresh: AuthSession = {
  accessToken: makeToken(NOW / 1000 + 600),
  refreshToken: makeToken(NOW / 1000 + 600),
  user: { id: "u1", name: "동환", avatar: null },
};

function mount() {
  return render(
    <I18nProvider locale="ko">
      <AuthSessionOverlay />
    </I18nProvider>,
  );
}

let google: FakeGoogle;

beforeEach(async () => {
  google = installFakeGoogle();
  await deleteAuthDatabase();
  resetAuthStore();
  configureAuth({ now: () => NOW });
});

afterEach(() => {
  resetFakeGoogle();
  resetAuthStore();
});

describe("AC-12 · 리프레시 만료 로그인 카드", () => {
  test("만료 상태에서 흐린 보드 위에 카드가 뜬다", async () => {
    useAuth.setState({ status: "expired", user: fresh.user });
    mount();
    expect(await screen.findByText("다시 로그인해 주세요")).toBeTruthy();
    expect(screen.getByTestId("google-slot")).toBeTruthy();
  });

  test("T2 · 카드 칸의 잰 너비(252)를 Google 버튼에 넘긴다", async () => {
    const restore = stubClientWidth(252);
    try {
      useAuth.setState({ status: "expired", user: fresh.user });
      mount();
      await waitFor(() => expect(google.renderButton).toHaveBeenCalledTimes(1));
      expect(google.renderButton.mock.calls[0][1]).toMatchObject({ width: 252 });
    } finally {
      restore();
    }
  });

  test("로그인하면 카드가 사라지고 로컬 사본은 유지된다", async () => {
    const api: AuthApi = {
      googleLogin: vi.fn(async () => fresh),
      signup: vi.fn(async () => fresh),
      login: vi.fn(async () => fresh),
      requestPasswordReset: vi.fn(async () => {}),
      confirmPasswordReset: vi.fn(async () => undefined),
      refresh: vi.fn(async () => fresh),
      logout: vi.fn(async () => undefined),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
    };
    configureAuth({ api });
    await saveSession(fresh);
    useAuth.setState({ status: "expired", user: fresh.user, session: fresh });

    mount();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    google.press("id-token");

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(screen.queryByText("다시 로그인해 주세요")).toBeNull();
    expect(await loadSession()).not.toBeNull();
  });

  test("Google을 못 쓰면 이유를 보여 주고 메일로 다시 들어올 수 있다", async () => {
    const api: AuthApi = {
      googleLogin: vi.fn(async () => fresh),
      signup: vi.fn(async () => fresh),
      login: vi.fn(async () => fresh),
      requestPasswordReset: vi.fn(async () => {}),
      confirmPasswordReset: vi.fn(async () => undefined),
      refresh: vi.fn(async () => fresh),
      logout: vi.fn(async () => undefined),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
    };
    configureAuth({ api });
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    useAuth.setState({ status: "expired", user: fresh.user, session: fresh });

    mount();
    expect(await screen.findByText("Google 클라이언트 ID가 없어요")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "메일로 계속" }));
    fireEvent.change(screen.getByLabelText("메일"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "pw" } });
    fireEvent.submit(screen.getByLabelText("메일").closest("form")!);

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(api.login).toHaveBeenCalledWith("a@b.co", "pw");
  });

  test("로그인 안 한(anonymous) 상태에서는 아무것도 그리지 않는다", () => {
    useAuth.setState({ status: "anonymous" });
    mount();
    expect(screen.queryByText("다시 로그인해 주세요")).toBeNull();
  });
});
