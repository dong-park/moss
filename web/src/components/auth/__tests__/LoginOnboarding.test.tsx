import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { LoginOnboarding } from "@/components/auth/LoginOnboarding";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import type { AuthSession } from "@/state/auth/types";

const fresh: AuthSession = {
  accessToken: "a.b.c",
  refreshToken: "a.b.c",
  user: { id: "u1", name: "동환", avatar: null },
};

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    googleLogin: vi.fn(async () => fresh),
    refresh: vi.fn(async () => fresh),
    previewInvite: vi.fn(),
    acceptInvite: vi.fn(),
    ...overrides,
  };
}

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
});

afterEach(() => {
  resetAuthStore();
});

function mount(props: { next?: string; onLoggedIn?: (t: string) => void }) {
  return render(
    <I18nProvider locale="ko">
      <LoginOnboarding {...props} />
    </I18nProvider>,
  );
}

describe("AC-4 · 로그인 온보딩", () => {
  test("소개·기능 3개·Google 버튼이 보인다", () => {
    configureAuth({ api: fakeApi(), googleIdToken: vi.fn() });
    mount({});
    expect(screen.getByText("moss에 오신 것을 환영해요")).toBeTruthy();
    expect(screen.getByText("메모를 자유롭게 붙이고 옮겨요")).toBeTruthy();
    expect(screen.getByText("연결선이 아이디어 사이를 이어 줘요")).toBeTruthy();
    expect(screen.getByText("링크로 동료와 함께 편집해요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
  });

  test("로그인하면 원래 열려던 주소(next)로 돌아간다", async () => {
    const onLoggedIn = vi.fn();
    configureAuth({
      api: fakeApi(),
      googleIdToken: vi.fn(async () => "id-token"),
    });
    mount({ next: "/b/abc", onLoggedIn });

    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith("/b/abc"));
  });

  test("next가 없으면 이동하지 않는다 — 게이트가 그대로 워크스페이스를 연다", async () => {
    const onLoggedIn = vi.fn();
    configureAuth({
      api: fakeApi(),
      googleIdToken: vi.fn(async () => "id-token"),
    });
    mount({ onLoggedIn });

    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));
    await waitFor(() => expect(useAuth.getState().status).toBe("authenticated"));
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  test("로그인에 실패하면 온보딩을 남긴다", async () => {
    const onLoggedIn = vi.fn();
    configureAuth({
      api: fakeApi(),
      googleIdToken: vi.fn(async () => {
        throw new Error("popup 닫힘");
      }),
    });
    mount({ next: "/b/abc", onLoggedIn });

    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Google 계정으로 로그인" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(onLoggedIn).not.toHaveBeenCalled();
  });
});
