import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { AuthSessionOverlay } from "@/components/auth/SessionExpiredCard";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase, loadSession, saveSession } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import type { AuthSession } from "@/state/auth/types";

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

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  configureAuth({ now: () => NOW });
});

afterEach(() => {
  resetAuthStore();
});

describe("AC-12 · 리프레시 만료 로그인 카드", () => {
  test("만료 상태에서 흐린 보드 위에 카드가 뜬다", async () => {
    useAuth.setState({ status: "expired", user: fresh.user });
    mount();
    expect(await screen.findByText("다시 로그인해 주세요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
  });

  test("로그인하면 카드가 사라지고 로컬 사본은 유지된다", async () => {
    const api: AuthApi = {
      googleLogin: vi.fn(async () => fresh),
      signup: vi.fn(async () => fresh),
      login: vi.fn(async () => fresh),
      refresh: vi.fn(async () => fresh),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
    };
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    await saveSession(fresh);
    useAuth.setState({ status: "expired", user: fresh.user, session: fresh });

    mount();
    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));

    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(screen.queryByText("다시 로그인해 주세요")).toBeNull();
    expect(await loadSession()).not.toBeNull();
  });

  test("로그인 안 한(anonymous) 상태에서는 아무것도 그리지 않는다", () => {
    useAuth.setState({ status: "anonymous" });
    mount();
    expect(screen.queryByText("다시 로그인해 주세요")).toBeNull();
  });
});
