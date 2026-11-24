import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { ShareControl } from "../ShareControl";
import { WallBadge } from "../WallBadge";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase } from "@/state/auth/tokenStore";
import type { AuthSession } from "@/state/auth/types";
import { resetShareStore, useShare } from "@/state/share";

const NOW = 1_700_000_000_000;

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(NOW / 1000 + 600),
  refreshToken: makeToken(NOW / 1000 + 600),
  user: { id: "u1", name: "동환", avatar: null },
};

function signIn() {
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
}

function wrap(node: React.ReactNode) {
  return render(<I18nProvider locale="ko">{node}</I18nProvider>);
}

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  resetShareStore();
  configureAuth({ now: () => NOW });
});

afterEach(() => {
  resetAuthStore();
  resetShareStore();
});

describe("WallBadge — 선택자 값 네 개의 문구", () => {
  it("이 기기에만", () => {
    wrap(<WallBadge boardId="b1" />);
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
  });

  it("올리는 중", () => {
    useShare.setState({ phaseByBoard: { b1: "uploading" } });
    wrap(<WallBadge boardId="b1" />);
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("올리는 중");
  });

  it("공유 중", () => {
    signIn();
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: "t", role: "owner" } } });
    wrap(<WallBadge boardId="b1" />);
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중");
  });

  it("공유 중이지만 로그아웃", () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: "t", role: "owner" } } });
    wrap(<WallBadge boardId="b1" />);
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("☁ 공유 중 · 로그인하면 맞춰요");
  });

  it("다른 벽의 공유 상태는 이 벽 배지에 새지 않는다", () => {
    signIn();
    useShare.setState({ byBoard: { other: { status: "shared", inviteToken: "t", role: "owner" } } });
    wrap(<WallBadge boardId="b1" />);
    expect(screen.getByTestId("wall-badge-label").textContent).toBe("🔒 이 기기에만");
  });
});

describe("ShareControl — 공유 ↗ 누름", () => {
  it("혼자 쓰는 벽의 누름은 팝오버 대신 시트를 연다", async () => {
    wrap(<ShareControl boardId="b1" boardName="벽" role="owner" />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(await screen.findByRole("dialog", { name: "이 벽을 공유할까요?" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "함께 쓰기" })).toBeNull();
  });

  it("공유 중인 벽의 누름은 링크 복사 팝오버를 연다", async () => {
    signIn();
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: "t", role: "owner" } } });
    wrap(<ShareControl boardId="b1" boardName="벽" role="owner" />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(await screen.findByRole("dialog", { name: "함께 쓰기" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "이 벽을 공유할까요?" })).toBeNull();
  });
});
