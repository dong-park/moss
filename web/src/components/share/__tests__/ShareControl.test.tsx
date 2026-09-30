import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { ShareControl } from "@/components/share/ShareControl";
import { configureAuth, resetAuthStore, useAuth } from "@/state/auth/store";
import { deleteAuthDatabase, saveSession } from "@/state/auth/tokenStore";
import type { AuthApi } from "@/state/auth/api";
import type { AuthSession, BoardSummary } from "@/state/auth/types";
import {
  configureShare,
  resetShareStore,
  useShare,
  type BoardMember,
  type ShareApi,
} from "@/state/share";

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

const board: BoardSummary = {
  id: "b1",
  name: "이번 주 기획",
  role: "owner",
  ownerName: "동환",
};

function fakeAuthApi(): AuthApi {
  return {
    googleLogin: vi.fn(async () => session),
    signup: vi.fn(async () => session),
    login: vi.fn(async () => session),
    refresh: vi.fn(async () => session),
    previewInvite: vi.fn(async () => ({ boardName: "이번 주 기획", ownerName: "동환" })),
    acceptInvite: vi.fn(async () => board),
  };
}

function fakeShareApi(overrides: Partial<ShareApi> = {}): ShareApi {
  return {
    share: vi.fn(async () => board),
    boardToken: vi.fn(async () => ({ boardToken: "bt-1", expiresInSeconds: 3600 })),
    unshare: vi.fn(async () => undefined),
    reissueInvite: vi.fn(async () => "tok-1"),
    removeMember: vi.fn(async () => undefined),
    members: vi.fn(async () => []),
    myBoards: vi.fn(async () => []),
    ...overrides,
  };
}

function mount(overrides: Partial<Parameters<typeof ShareControl>[0]> = {}) {
  return render(
    <I18nProvider locale="ko">
      <ShareControl boardId="b1" boardName="이번 주 기획" role="owner" {...overrides} />
    </I18nProvider>,
  );
}

function shareButton() {
  return screen.getByRole("button", { name: "공유" });
}

async function openPopover() {
  fireEvent.click(shareButton());
  return screen.findByRole("dialog", { name: "함께 쓰기" });
}

async function loginState() {
  await saveSession(session);
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
}

async function openMemberMenu(name: string) {
  const row = await screen.findByRole("button", { name: `${name} 멤버 메뉴` });
  fireEvent.pointerDown(row, { button: 0, pointerType: "mouse" });
  fireEvent.click(row);
  return row;
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

describe("AC-4 · 공유 시작과 로그인", () => {
  test("로그인 안 한 상태: 공유 아이콘 → Google 버튼 (2클릭)", async () => {
    const shareApi = fakeShareApi();
    configureShare({ api: shareApi });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    mount();

    await openPopover();
    expect(screen.queryByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
    expect(shareApi.share).not.toHaveBeenCalled();
  });

  test("Google 클릭 뒤 이 보드만 올라가고 팝오버가 링크 복사·내 이름으로 바뀐다", async () => {
    const shareApi = fakeShareApi();
    const onStartShare = vi.fn();
    configureShare({ api: shareApi });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    mount({ onStartShare });

    await openPopover();
    fireEvent.click(screen.getByRole("button", { name: "Google 계정으로 로그인" }));

    await waitFor(() => expect(shareApi.share).toHaveBeenCalledTimes(1));
    expect(shareApi.share).toHaveBeenCalledWith("b1", "이번 주 기획", session.accessToken);
    // 이 보드만 업로드 — 다른 보드 호출 없음.
    expect(onStartShare).toHaveBeenCalledTimes(1);
    expect(onStartShare).toHaveBeenCalledWith("b1");

    expect(await screen.findByText("링크 복사")).toBeTruthy();
    expect(screen.getByText("동환")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Google 계정으로 로그인" })).toBeNull();
  });

  test("이미 로그인돼 있으면 '공유 시작' 1클릭으로 끝난다", async () => {
    const shareApi = fakeShareApi();
    configureShare({ api: shareApi });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    mount();

    await openPopover();
    fireEvent.click(screen.getByRole("button", { name: "공유 시작" }));
    await waitFor(() => expect(shareApi.share).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("링크 복사")).toBeTruthy();
  });
});

describe("AC-6 · 링크 재발급", () => {
  test("재발급하면 새 토큰이 발급되고 멤버는 그대로 남는다", async () => {
    const member: BoardMember = { id: "u1", name: "동환", avatar: null, role: "owner" };
    const shareApi = fakeShareApi({
      reissueInvite: vi.fn(async () => "tok-2"),
    });
    configureShare({ api: shareApi });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: "tok-1" } },
    });
    mount({ members: [member] });

    await openPopover();
    await openMemberMenu("동환");
    fireEvent.click(await screen.findByRole("menuitem", { name: "링크 재발급" }));

    await waitFor(() => expect(shareApi.reissueInvite).toHaveBeenCalledWith("b1", session.accessToken));
    await waitFor(() =>
      expect(useShare.getState().byBoard.b1.inviteToken).toBe("tok-2"),
    );
    // 재발급은 멤버를 내보내지 않는다 (AC-6).
    expect(screen.getByText("동환")).toBeTruthy();
  });

  test("멤버 메뉴에서 내보내기는 편집자에게만 나온다", async () => {
    const owner: BoardMember = { id: "u1", name: "동환", avatar: null, role: "owner" };
    const editor: BoardMember = { id: "u2", name: "민지", avatar: null, role: "editor" };
    const shareApi = fakeShareApi();
    configureShare({ api: shareApi });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: "tok-1" } },
    });
    mount({ members: [owner, editor] });

    await openPopover();
    await openMemberMenu("민지");
    fireEvent.click(await screen.findByRole("menuitem", { name: "내보내기" }));
    await waitFor(() =>
      expect(shareApi.removeMember).toHaveBeenCalledWith("b1", "u2", session.accessToken),
    );
  });
});

describe("AC-15 · 한도", () => {
  test("멤버가 20명이면 자리 문구를 보여주고 링크를 숨긴다", async () => {
    const members: BoardMember[] = Array.from({ length: 20 }, (_, i) => ({
      id: `u${i}`,
      name: `사람${i}`,
      avatar: null,
      role: i === 0 ? "owner" : "editor",
    }));
    configureShare({ api: fakeShareApi() });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: "tok-1" } },
    });
    mount({ members });

    await openPopover();
    expect(screen.getByText("이 보드는 자리가 다 찼어요")).toBeTruthy();
    expect(screen.queryByText("링크 복사")).toBeNull();
  });
});

describe("n8a 리뷰 2 · 새로고침 복원 — 링크가 없으면 명시 버튼", () => {
  test("공유 상태인데 링크가 없으면 '링크 새로 만들기'를 누를 때만 재발급한다", async () => {
    const shareApi = fakeShareApi({ reissueInvite: vi.fn(async () => "tok-new") });
    configureShare({ api: shareApi });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    // `/me/boards` 복원 직후 — shared인데 옛 토큰은 서버가 해시만 저장해 알 수 없다.
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: null, role: "owner" } },
    });
    mount({ role: "owner" });

    await openPopover();
    // 자동 재발급하지 않는다 (n8a 리뷰 2).
    expect(shareApi.reissueInvite).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "링크 새로 만들기" }));
    await waitFor(() => expect(shareApi.reissueInvite).toHaveBeenCalledWith("b1", session.accessToken));
    expect(await screen.findByText("링크 복사")).toBeTruthy();
  });

  test("편집자에게는 '링크 새로 만들기'가 없다 — 서버가 403으로 막는 동작이다", async () => {
    configureShare({ api: fakeShareApi() });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    useShare.setState({
      byBoard: { b1: { status: "shared", inviteToken: null, role: "editor" } },
    });
    mount({ role: "editor" });

    await openPopover();
    expect(screen.queryByRole("button", { name: "링크 새로 만들기" })).toBeNull();
  });
});

describe("n8a 리뷰 보안 P1 — 역할을 모르면 소유자 메뉴를 숨긴다", () => {
  test("role 을 주지 않으면 편집자 메뉴에 내보내기가 없다", async () => {
    const owner: BoardMember = { id: "u1", name: "동환", avatar: null, role: "owner" };
    const editor: BoardMember = { id: "u2", name: "민지", avatar: null, role: "editor" };
    configureShare({ api: fakeShareApi() });
    configureAuth({ api: fakeAuthApi(), googleIdToken: vi.fn(async () => "id-token") });
    await loginState();
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: "tok-1" } } });
    mount({ role: undefined, members: [owner, editor] });

    await openPopover();
    await openMemberMenu("민지");
    expect(screen.queryByRole("menuitem", { name: "내보내기" })).toBeNull();
  });
});
