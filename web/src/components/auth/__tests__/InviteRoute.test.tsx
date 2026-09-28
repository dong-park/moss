import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { InviteRoute } from "@/components/auth/InviteRoute";
import {
  configureAuth,
  resetAuthStore,
  useAuth,
} from "@/state/auth/store";
import { deleteAuthDatabase, loadSession, saveSession } from "@/state/auth/tokenStore";
import { InviteExpiredError, InviteFullError, type AuthApi } from "@/state/auth/api";
import type { AuthSession, BoardSummary } from "@/state/auth/types";

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

const joinedBoard: BoardSummary = {
  id: "b1",
  name: "이번 주 기획",
  role: "editor",
  ownerName: "동환",
};

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    googleLogin: vi.fn(async () => session),
    refresh: vi.fn(async () => session),
    previewInvite: vi.fn(async () => ({ boardName: "이번 주 기획", ownerName: "동환" })),
    acceptInvite: vi.fn(async () => joinedBoard),
    ...overrides,
  };
}

function mount(props: Parameters<typeof InviteRoute>[0]) {
  return render(
    <I18nProvider locale="ko">
      <InviteRoute {...props} />
    </I18nProvider>,
  );
}

async function joinButton() {
  return screen.findByRole("button", { name: "참여하기" });
}

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  configureAuth({ now: () => NOW });
});

afterEach(() => {
  resetAuthStore();
});

describe("AC-5 · InviteRoute", () => {
  test("카드 이름은 미리보기 응답에서 온다 (쿼리 파라미터 없음)", async () => {
    const api = fakeApi();
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    mount({ token: "tok", onJoined: vi.fn() });
    expect(await screen.findByText("동환님의 초대")).toBeTruthy();
    expect(screen.getByText("이번 주 기획")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
    expect(api.previewInvite).toHaveBeenCalledWith("tok");
  });

  test("로그인만으로는 수락하지 않는다 — 참여하기 1탭이 동의 지점", async () => {
    const api = fakeApi();
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    const onJoined = vi.fn();
    mount({ token: "tok", onJoined });

    fireEvent.click(await screen.findByRole("button", { name: "Google 계정으로 로그인" }));
    await waitFor(() => expect(api.googleLogin).toHaveBeenCalledWith("id-token"));
    expect(api.acceptInvite).not.toHaveBeenCalled();

    fireEvent.click(await joinButton());
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(joinedBoard));
    expect(api.acceptInvite).toHaveBeenCalledWith("tok", session.accessToken);
    expect(useAuth.getState().status).toBe("authenticated");
  });

  test("로그인 안 한 상태에서는 수락 네트워크를 부르지 않는다", async () => {
    const api = fakeApi();
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    mount({ token: "tok", onJoined: vi.fn() });
    await screen.findByRole("button", { name: "Google 계정으로 로그인" });
    expect(api.acceptInvite).not.toHaveBeenCalled();
    expect(api.googleLogin).not.toHaveBeenCalled();
  });

  test("미리보기 실패면 fallback 이름과 로그인 버튼을 유지한다", async () => {
    const api = fakeApi({
      previewInvite: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    mount({ token: "tok", onJoined: vi.fn() });

    expect(await screen.findByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
    expect(screen.getByText("공유 보드")).toBeTruthy();
  });

  test("수락이 예상 밖 오류면 다시 시도 버튼으로 재시도한다", async () => {
    const acceptInvite = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(joinedBoard);
    await saveSession(session);
    useAuth.setState({ session, user: session.user, status: "authenticated", hydrated: true });
    configureAuth({ api: fakeApi({ acceptInvite }), googleIdToken: vi.fn(async () => "id-token") });
    const onJoined = vi.fn();
    mount({ token: "tok", onJoined });

    fireEvent.click(await joinButton());
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(joinedBoard));
  });

  test("세션이 만료됐으면 참여하기 대신 재로그인 버튼을 보여준다", async () => {
    await saveSession(session);
    useAuth.setState({ session, user: session.user, status: "expired", hydrated: true });
    configureAuth({ api: fakeApi(), googleIdToken: vi.fn(async () => "id-token") });
    mount({ token: "tok", onJoined: vi.fn() });

    expect(await screen.findByRole("button", { name: "Google 계정으로 로그인" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "참여하기" })).toBeNull();
  });
});

describe("AC-6 · 만료된 초대", () => {
  async function mountLoggedIn(api: AuthApi) {
    await saveSession(session);
    useAuth.setState({ session, user: session.user, status: "authenticated", hydrated: true });
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    mount({ token: "expired", onJoined: vi.fn() });
  }

  test("이미 로그인돼 있으면 참여하기를 눌렀을 때 만료를 판정한다", async () => {
    const api = fakeApi({
      acceptInvite: vi.fn(async () => {
        throw new InviteExpiredError();
      }),
    });
    await mountLoggedIn(api);

    expect(screen.queryByRole("button", { name: "Google 계정으로 로그인" })).toBeNull();
    fireEvent.click(await joinButton());
    expect(await screen.findByText("만료된 초대예요")).toBeTruthy();
    expect(api.acceptInvite).toHaveBeenCalledTimes(1);
  });

  test("한도 초과면 자리 문구를 보여준다", async () => {
    const api = fakeApi({
      acceptInvite: vi.fn(async () => {
        throw new InviteFullError();
      }),
    });
    await mountLoggedIn(api);
    fireEvent.click(await joinButton());
    expect(await screen.findByText("이 보드는 자리가 다 찼어요")).toBeTruthy();
  });

  test("만료 판정 뒤에도 저장된 세션(로컬 사본)을 지우지 않는다", async () => {
    const api = fakeApi({
      acceptInvite: vi.fn(async () => {
        throw new InviteExpiredError();
      }),
    });
    await mountLoggedIn(api);
    fireEvent.click(await joinButton());
    await screen.findByText("만료된 초대예요");
    expect(await loadSession()).not.toBeNull();
  });
});

describe("AC-6 · 재발급된 옛 링크 (비로그인)", () => {
  test("미리보기가 410이면 로그인 버튼 없이 만료를 보여준다", async () => {
    const api = fakeApi({
      previewInvite: vi.fn(async () => {
        throw new InviteExpiredError();
      }),
    });
    configureAuth({ api, googleIdToken: vi.fn(async () => "id-token") });
    mount({ token: "old", onJoined: vi.fn() });
    await screen.findByText("만료된 초대예요");
    expect(screen.queryByRole("button", { name: "Google 계정으로 로그인" })).toBeNull();
  });
});
