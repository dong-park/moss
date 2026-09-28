import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { configureAuth, resetAuthStore, SessionExpiredError, useAuth } from "../store";
import { deleteAuthDatabase, loadSession, saveSession } from "../tokenStore";
import { AuthRequestError, type AuthApi } from "../api";
import type { AuthSession, BoardSummary } from "../types";

const NOW = 1_700_000_000_000;

function makeToken(exp: number): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp })}.sig`;
}

function sessionWith(accessExp: number, refreshExp: number): AuthSession {
  return {
    accessToken: makeToken(accessExp),
    refreshToken: makeToken(refreshExp),
    user: { id: "u1", name: "동환", avatar: null },
  };
}

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    googleLogin: vi.fn(async () => sessionWith(NOW / 1000 + 600, NOW / 1000 + 600)),
    refresh: vi.fn(async (): Promise<AuthSession> => {
      throw new AuthRequestError("refresh 401", 401);
    }),
    previewInvite: vi.fn(async () => ({ boardName: "이번 주 기획", ownerName: "동환" })),
    acceptInvite: vi.fn(async (): Promise<BoardSummary> => ({
      id: "b1",
      name: "이번 주 기획",
      role: "editor",
      ownerName: "동환",
    })),
    ...overrides,
  };
}

const googleIdToken = vi.fn(async () => "google-id-token");

beforeEach(async () => {
  await deleteAuthDatabase();
  resetAuthStore();
  googleIdToken.mockClear();
  configureAuth({ now: () => NOW, googleIdToken });
});

afterEach(() => {
  resetAuthStore();
});

describe("auth/store", () => {
  test("저장된 세션이 없으면 anonymous", async () => {
    const api = fakeApi();
    configureAuth({ api });
    await useAuth.getState().hydrate();
    expect(useAuth.getState().status).toBe("anonymous");
    expect(api.refresh).not.toHaveBeenCalled();
  });

  test("유효한 액세스 토큰이면 authenticated, 갱신 안 함", async () => {
    const api = fakeApi();
    configureAuth({ api });
    await saveSession(sessionWith(NOW / 1000 + 600, NOW / 1000 + 600));
    await useAuth.getState().hydrate();
    expect(useAuth.getState().status).toBe("authenticated");
    expect(api.refresh).not.toHaveBeenCalled();
  });

  test("액세스 만료·리프레시 유효면 조용히 갱신", async () => {
    const refreshed = sessionWith(NOW / 1000 + 600, NOW / 1000 + 600);
    const api = fakeApi({ refresh: vi.fn(async () => refreshed) });
    configureAuth({ api });
    await saveSession(sessionWith(NOW / 1000 - 10, NOW / 1000 + 600));
    await useAuth.getState().hydrate();
    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().status).toBe("authenticated");
    expect((await loadSession())?.accessToken).toBe(refreshed.accessToken);
  });

  test("갱신이 401/403이면 expired", async () => {
    const api = fakeApi({
      refresh: vi.fn(async () => {
        throw new AuthRequestError("refresh 401", 401);
      }),
    });
    configureAuth({ api });
    await saveSession(sessionWith(NOW / 1000 - 10, NOW / 1000 + 600));
    await useAuth.getState().hydrate();
    expect(useAuth.getState().status).toBe("expired");
  });

  test("갱신이 네트워크 오류면 expired가 아니고 재시도 가능", async () => {
    const api = fakeApi({
      refresh: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    configureAuth({ api });
    await saveSession(sessionWith(NOW / 1000 - 10, NOW / 1000 + 600));
    await useAuth.getState().hydrate();
    expect(useAuth.getState().status).not.toBe("expired");
    expect(useAuth.getState().session).not.toBeNull();
    // session이 있으면 status도 맞춘다 — anonymous로 남기지 않는다.
    expect(useAuth.getState().status).toBe("authenticated");
    // hydrated가 다시 false로 풀려 다음 hydrate가 재시도한다.
    expect(useAuth.getState().hydrated).toBe(false);

    const ok = fakeApi({ refresh: vi.fn(async () => sessionWith(NOW / 1000 + 600, NOW / 1000 + 600)) });
    configureAuth({ api: ok });
    await useAuth.getState().hydrate();
    expect(useAuth.getState().status).toBe("authenticated");
  });

  test("리프레시 만료면 expired, 네트워크 0건, 토큰은 남긴다 (AC-12)", async () => {
    const api = fakeApi();
    configureAuth({ api });
    await saveSession(sessionWith(NOW / 1000 - 100, NOW / 1000 - 100));
    await useAuth.getState().hydrate();
    expect(useAuth.getState().status).toBe("expired");
    expect(api.refresh).not.toHaveBeenCalled();
    expect(await loadSession()).not.toBeNull();
  });

  test("loginWithGoogle이 토큰을 저장하고 authenticated", async () => {
    const api = fakeApi();
    configureAuth({ api });
    const user = await useAuth.getState().loginWithGoogle();
    expect(user.name).toBe("동환");
    expect(googleIdToken).toHaveBeenCalledTimes(1);
    expect(api.googleLogin).toHaveBeenCalledWith("google-id-token");
    expect(useAuth.getState().status).toBe("authenticated");
    expect(await loadSession()).not.toBeNull();
  });

  test("세션 없이 acceptInvite면 SessionExpiredError", async () => {
    configureAuth({ api: fakeApi() });
    await expect(useAuth.getState().acceptInvite("tok")).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  test("세션이 있으면 acceptInvite가 액세스 토큰을 붙여 부른다", async () => {
    const session = sessionWith(NOW / 1000 + 600, NOW / 1000 + 600);
    const api = fakeApi();
    configureAuth({ api });
    await saveSession(session);
    const board = await useAuth.getState().acceptInvite("tok");
    expect(api.acceptInvite).toHaveBeenCalledWith("tok", session.accessToken);
    expect(board.name).toBe("이번 주 기획");
  });

  test("진행 중 refresh를 single-flight로 공유한다", async () => {
    const refreshed = sessionWith(NOW / 1000 + 600, NOW / 1000 + 600);
    let resolveRefresh!: (session: AuthSession) => void;
    const refresh = vi.fn(
      () => new Promise<AuthSession>((resolve) => (resolveRefresh = resolve)),
    );
    configureAuth({ api: fakeApi({ refresh }) });
    const stale = sessionWith(NOW / 1000 - 10, NOW / 1000 + 600);
    useAuth.setState({ session: stale, user: stale.user, status: "authenticated" });

    const first = useAuth.getState().ensureSession();
    const second = useAuth.getState().ensureSession();
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh(refreshed);
    expect((await first).accessToken).toBe(refreshed.accessToken);
    expect((await second).accessToken).toBe(refreshed.accessToken);
  });

  test("진행 중 refresh가 로그아웃 뒤 옛 세션을 되살리지 않는다", async () => {
    let resolveRefresh!: (session: AuthSession) => void;
    const refresh = vi.fn(
      () => new Promise<AuthSession>((resolve) => (resolveRefresh = resolve)),
    );
    configureAuth({ api: fakeApi({ refresh }) });
    const stale = sessionWith(NOW / 1000 - 10, NOW / 1000 + 600);
    useAuth.setState({ session: stale, user: stale.user, status: "authenticated" });
    await saveSession(stale);

    const pending = useAuth.getState().ensureSession();
    await useAuth.getState().logout();
    resolveRefresh(sessionWith(NOW / 1000 + 600, NOW / 1000 + 600));
    await pending;

    expect(useAuth.getState().session).toBeNull();
    expect(useAuth.getState().status).toBe("anonymous");
    expect(await loadSession()).toBeNull();
  });

  test("ensureSession이 IndexedDB에서 유효 세션을 읽으면 authenticated로 맞춘다", async () => {
    configureAuth({ api: fakeApi() });
    await saveSession(sessionWith(NOW / 1000 + 600, NOW / 1000 + 600));
    useAuth.setState({ session: null, user: null, status: "anonymous", hydrated: false });

    const session = await useAuth.getState().ensureSession();
    expect(session).not.toBeNull();
    expect(useAuth.getState().status).toBe("authenticated");
  });
});
