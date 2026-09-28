"use client";

/**
 * 로그인 세션 상태. localStorage처럼 IndexedDB에서 복원하고,
 * 액세스 토큰이 만료 전이면 조용히 갱신한다 (AC-11의 클라이언트 측 절반).
 *
 * 네트워크는 hydrate에서 저장된 세션이 있을 때만, 그리고 login/accept 같은
 * 명시적 액션에서만 나간다. 로그인 안 한 경로는 0건 (AC-1).
 */
import { create } from "zustand";
import { AuthRequestError, realAuthApi, type AuthApi } from "./api";
import { loadSession, saveSession, clearSession } from "./tokenStore";
import { isExpired } from "./jwt";
import { requestGoogleIdToken } from "./googleIdentity";
import type { AuthSession, AuthUser, BoardSummary, InvitePreview } from "./types";

/** 만료 직전 선제 갱신 여유. */
const ACCESS_SKEW_MS = 30_000;

export interface AuthDeps {
  api: AuthApi;
  googleIdToken: () => Promise<string>;
  now: () => number;
}

const defaultDeps: AuthDeps = {
  api: realAuthApi,
  googleIdToken: () => requestGoogleIdToken(),
  now: () => Date.now(),
};

let deps: AuthDeps = defaultDeps;

export function configureAuth(next: Partial<AuthDeps>): void {
  deps = { ...deps, ...next };
}

export function resetAuthDeps(): void {
  deps = defaultDeps;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("로그인이 필요해요");
    this.name = "SessionExpiredError";
  }
}

export type AuthStatus = "anonymous" | "authenticated" | "expired";

/**
 * 401/403만 "로그인이 풀렸다"는 뜻이다. 네트워크 오류·5xx는 일시 장애로 보고
 * 세션을 유지한 채 다음 시도에 맡긴다.
 */
function isAuthExpiryError(err: unknown): boolean {
  return err instanceof AuthRequestError && (err.status === 401 || err.status === 403);
}

/**
 * 진행 중인 refresh를 공유한다 — 동시 호출이 토큰을 여러 번 갈아치우지 않게.
 * epoch는 logout·login에서 증가한다. 시작 시점과 달라졌으면 진행 중 refresh의
 * persist를 건너뛴다 — 로그아웃 뒤 옛 세션을 되살리지 않는다.
 */
let refreshEpoch = 0;
let refreshInFlight: Promise<AuthSession> | null = null;

function invalidateRefresh(): void {
  refreshEpoch += 1;
  refreshInFlight = null;
}

async function refreshAndPersist(refreshToken: string): Promise<AuthSession> {
  const startedEpoch = refreshEpoch;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const next = await deps.api.refresh(refreshToken);
        if (startedEpoch === refreshEpoch) await persist(next);
        return next;
      } finally {
        // epoch가 바뀌었으면 이미 무효화된 refresh다 — 새 in-flight를 지우지 않는다.
        if (startedEpoch === refreshEpoch) refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSession | null;
  hydrating: boolean;
  hydrated: boolean;

  /** IndexedDB에서 세션을 복원한다. 최초 1회만 실제로 돈다. */
  hydrate(): Promise<void>;
  loginWithGoogle(): Promise<AuthUser>;
  /** 무인증 초대 미리보기 — 카드 이름을 서버가 알려준 값으로만 채운다. */
  previewInvite(token: string): Promise<InvitePreview>;
  /** 유효 세션을 보장하고 초대를 수락한다. 세션이 없으면 SessionExpiredError. */
  acceptInvite(token: string): Promise<BoardSummary>;
  ensureSession(): Promise<AuthSession>;
  logout(): Promise<void>;
}

async function persist(session: AuthSession): Promise<void> {
  await saveSession(session);
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrating: false,
    hydrated: true,
  });
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "anonymous",
  user: null,
  session: null,
  hydrating: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated || get().hydrating) return;
    set({ hydrating: true });
    let retry = false;
    try {
      const saved = await loadSession();
      if (!saved) {
        set({ status: "anonymous", user: null, session: null });
        return;
      }
      if (isExpired(saved.refreshToken, 0, deps.now())) {
        // 리프레시 토큰 만료 — 로그인 카드. 로컬 사본·토큰은 지우지 않는다 (AC-12).
        set({ session: saved, user: saved.user, status: "expired" });
        return;
      }
      if (isExpired(saved.accessToken, ACCESS_SKEW_MS, deps.now())) {
        // 액세스 만료 — session·status를 함께 맞춘 뒤 갱신을 시도한다.
        set({ session: saved, user: saved.user, status: "authenticated" });
        try {
          await refreshAndPersist(saved.refreshToken);
        } catch (err) {
          if (isAuthExpiryError(err)) {
            set({ status: "expired" });
          } else {
            // 일시 장애 — 다음 hydrate에서 재시도한다.
            retry = true;
          }
        }
        return;
      }
      set({ session: saved, user: saved.user, status: "authenticated" });
    } catch {
      // IndexedDB 접근 실패 → 로그인 안 한 상태로 취급.
      set({ status: "anonymous", user: null, session: null });
    } finally {
      set({ hydrating: false, hydrated: !retry });
    }
  },

  loginWithGoogle: async () => {
    // 새 로그인이 진행 중 refresh보다 우선한다 — 옛 세션을 되살리지 않는다.
    invalidateRefresh();
    const idToken = await deps.googleIdToken();
    const session = await deps.api.googleLogin(idToken);
    await persist(session);
    return session.user;
  },

  ensureSession: async () => {
    let session = get().session;
    if (!session) {
      const saved = await loadSession();
      if (!saved) {
        set({ status: "anonymous" });
        throw new SessionExpiredError();
      }
      session = saved;
      // IndexedDB에서 유효 세션을 복원했으면 로그인 상태로도 맞춘다.
      set({ session: saved, user: saved.user, status: "authenticated" });
    }
    if (!isExpired(session.accessToken, ACCESS_SKEW_MS, deps.now())) return session;
    if (isExpired(session.refreshToken, 0, deps.now())) {
      set({ status: "expired" });
      throw new SessionExpiredError();
    }
    try {
      return await refreshAndPersist(session.refreshToken);
    } catch (err) {
      if (isAuthExpiryError(err)) {
        set({ status: "expired" });
        throw new SessionExpiredError();
      }
      // 네트워크 오류·5xx는 원인을 그대로 전파한다 — 만료로 단정하지 않는다.
      throw err;
    }
  },

  previewInvite: (token) => deps.api.previewInvite(token),

  acceptInvite: async (token) => {
    const session = await get().ensureSession();
    return deps.api.acceptInvite(token, session.accessToken);
  },

  logout: async () => {
    // 진행 중 refresh가 로그아웃 뒤 persist하지 못하게 무효화한다.
    invalidateRefresh();
    await clearSession();
    set({ status: "anonymous", user: null, session: null });
  },
}));

/** 테스트 격리용 — deps와 상태를 초기화한다. */
export function resetAuthStore(): void {
  resetAuthDeps();
  refreshEpoch = 0;
  refreshInFlight = null;
  useAuth.setState({
    status: "anonymous",
    user: null,
    session: null,
    hydrating: false,
    hydrated: false,
  });
}
