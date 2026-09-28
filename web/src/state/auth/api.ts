/**
 * Ktor API 단일 진입점. n4 계약만 부른다.
 *
 * 로그인 안 한 경로에서 이 모듈의 함수를 아무도 호출하지 않으면 네트워크는 0건이다.
 * 모듈 로드 시점에 fetch하지 않는다 (AC-1).
 */
import type { AuthSession, BoardSummary, InvitePreview } from "./types";

/** API base URL 설정 오류 — 초대 상태 오류로 감싸지 않고 그대로 전파한다. */
export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}

export function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MOSS_API_URL;
  if (configured) return configured;
  // dev에서만 localhost 폴백. production 배포 실수는 첫 요청 때 드러나게 한다.
  if (process.env.NODE_ENV === "production") {
    throw new ApiConfigError("NEXT_PUBLIC_MOSS_API_URL이 설정되지 않았어요");
  }
  return "http://localhost:8080";
}

export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

/** 초대 토큰이 없거나 재발급으로 무효화됨 (Ktor 410). */
export class InviteExpiredError extends Error {
  constructor() {
    super("만료된 초대예요");
    this.name = "InviteExpiredError";
  }
}

/** 보드 멤버 20명 한도 초과 (Ktor 409). */
export class InviteFullError extends Error {
  constructor() {
    super("이 보드는 자리가 다 찼어요");
    this.name = "InviteFullError";
  }
}

export interface AuthApi {
  googleLogin(idToken: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  previewInvite(token: string): Promise<InvitePreview>;
  acceptInvite(token: string, accessToken: string): Promise<BoardSummary>;
}

async function postJson<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new AuthRequestError(`${path} ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

function mapInviteStatus(err: unknown): Error {
  if (err instanceof ApiConfigError) return err;
  if (err instanceof AuthRequestError && err.status === 410) return new InviteExpiredError();
  if (err instanceof AuthRequestError && err.status === 409) return new InviteFullError();
  return err instanceof Error ? err : new AuthRequestError("초대 요청이 실패했어요", 0);
}

export const realAuthApi: AuthApi = {
  googleLogin: (idToken) => postJson<AuthSession>("/auth/google", { idToken }),
  refresh: (refreshToken) => postJson<AuthSession>("/auth/refresh", { refreshToken }),
  previewInvite: async (token) => {
    try {
      return await postJson<InvitePreview>("/invites/preview", { token });
    } catch (err) {
      throw mapInviteStatus(err);
    }
  },
  acceptInvite: async (token, accessToken) => {
    try {
      return await postJson<BoardSummary>("/invites/accept", { token }, accessToken);
    } catch (err) {
      throw mapInviteStatus(err);
    }
  },
};
