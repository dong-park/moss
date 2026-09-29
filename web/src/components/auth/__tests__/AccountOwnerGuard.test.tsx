import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import {
  AccountOwnerGuard,
  resolveLocalOwner,
} from "@/components/auth/AccountOwnerGuard";
import { resetAuthStore, useAuth } from "@/state/auth/store";
import { useStorage } from "@/state/storage";
import { DEFAULT_SETTINGS } from "@/state/db/schema";

const realUpdateSettings = useStorage.getState().updateSettings;

function setSettings(ownerUserId: string | null) {
  useStorage.setState({
    initialized: true,
    settings: { ...DEFAULT_SETTINGS, ownerUserId },
  });
}

function signIn(userId: string) {
  useAuth.setState({
    status: "authenticated",
    hydrated: true,
    user: { id: userId, name: userId, avatar: null },
  });
}

beforeEach(() => {
  resetAuthStore();
  setSettings(null);
});

afterEach(() => {
  resetAuthStore();
  useStorage.setState({
    initialized: false,
    settings: null,
    quota: null,
    updateSettings: realUpdateSettings,
  });
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <AccountOwnerGuard />
    </I18nProvider>,
  );
}

describe("resolveLocalOwner · 주인 판정 (D5-2)", () => {
  test("기록이 없으면 claim, 같으면 match, 다르면 mismatch", () => {
    expect(resolveLocalOwner(null, "u1")).toBe("claim");
    expect(resolveLocalOwner(undefined, "u1")).toBe("claim");
    expect(resolveLocalOwner("", "u1")).toBe("claim");
    expect(resolveLocalOwner("u1", "u1")).toBe("match");
    expect(resolveLocalOwner("u1", "u2")).toBe("mismatch");
  });
});

describe("AccountOwnerGuard (AC-15)", () => {
  test("처음 로그인하면 로컬 데이터 주인을 기록하고 카드는 안 뜬다", async () => {
    const updateSettings = vi.fn(async () => {});
    useStorage.setState({ updateSettings });
    signIn("u1");
    mount();

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ ownerUserId: "u1" }),
    );
    expect(screen.queryByText("다른 계정의 보드가 이 기기에 있어요")).toBeNull();
  });

  test("같은 계정이면 카드가 뜨지 않는다", () => {
    setSettings("u1");
    signIn("u1");
    mount();
    expect(screen.queryByText("다른 계정의 보드가 이 기기에 있어요")).toBeNull();
  });

  test("다른 계정이면 안내 카드를 띄운다", () => {
    setSettings("u1");
    signIn("u2");
    mount();
    expect(screen.getByText("다른 계정의 보드가 이 기기에 있어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이대로 계속" })).toBeTruthy();
  });

  test("계속을 누르면 카드가 사라지고 세션은 유지된다", () => {
    setSettings("u1");
    signIn("u2");
    mount();

    fireEvent.click(screen.getByRole("button", { name: "이대로 계속" }));
    expect(screen.queryByText("다른 계정의 보드가 이 기기에 있어요")).toBeNull();
    expect(useAuth.getState().status).toBe("authenticated");
  });

  test("로그아웃을 누르면 세션이 비워진다", async () => {
    setSettings("u1");
    signIn("u2");
    mount();

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(useAuth.getState().status).toBe("anonymous"));
    expect(screen.queryByText("다른 계정의 보드가 이 기기에 있어요")).toBeNull();
  });
});
