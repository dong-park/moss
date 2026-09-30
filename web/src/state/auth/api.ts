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
  signup(email: string, password: string, name: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  previewInvite(token: string): Promise<InvitePreview>;
  acceptInvite(token: string, accessToken: string): Promise<BoardSummary>;
}

/**
 * 실패 본문은 Errors.kt의 `{ error, message }` 형식이다. `message`가 있으면 사람이 읽을
 * 문구를 그대로 쓰고, 없으면(비JSON·프록시 오류) null을 돌려준다 — 호출자가 상태 코드별
 * 기본 문구를 살릴 수 있게 한다. "/auth/login 401" 같은 기계 문구를 만들지 않는다.
 */
export async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body?.message === "string" && body.message) return body.message;
  } catch {
    // 본문이 JSON이 아니면 서버 문구 없음.
  }
  return null;
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
    throw new AuthRequestError((await readErrorMessage(res)) ?? "", res.status);
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
  signup: (email, password, name) =>
    postJson<AuthSession>("/auth/signup", { email, password, name }),
  login: (email, password) => postJson<AuthSession>("/auth/login", { email, password }),
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
