import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApiConfigError,
  apiBaseUrl,
  InviteExpiredError,
  InviteFullError,
  realAuthApi,
} from "../api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auth/api", () => {
  test("production에서 API URL이 없으면 throw, dev에서는 localhost 폴백", () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => apiBaseUrl()).toThrow(/MOSS_API_URL/);

    vi.stubEnv("NODE_ENV", "development");
    expect(apiBaseUrl()).toBe("http://localhost:8080");
  });

  test("previewInvite는 410을 InviteExpiredError로 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(410, { error: "gone" })));
    await expect(realAuthApi.previewInvite("tok")).rejects.toBeInstanceOf(InviteExpiredError);
  });

  test("acceptInvite는 409를 InviteFullError로 매핑한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, { error: "conflict" })));
    await expect(realAuthApi.acceptInvite("tok", "access")).rejects.toBeInstanceOf(
      InviteFullError,
    );
  });

  test("base URL 설정 오류는 초대 오류로 감싸지 않고 그대로 전파한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(realAuthApi.previewInvite("tok")).rejects.toBeInstanceOf(ApiConfigError);
  });

  test("signup은 /auth/signup에 email·password·name을 보낸다", async () => {
    const session = { accessToken: "a", refreshToken: "r", user: { id: "u1", name: "동환", avatar: null } };
    const fetchMock = vi.fn(async () => jsonResponse(200, session));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realAuthApi.signup("a@x.com", "secret123", "동환")).resolves.toEqual(session);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/auth/signup");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@x.com",
      password: "secret123",
      name: "동환",
    });
  });

  test("login은 /auth/login에 email·password를 보낸다", async () => {
    const session = { accessToken: "a", refreshToken: "r", user: { id: "u1", name: "동환", avatar: null } };
    const fetchMock = vi.fn(async () => jsonResponse(200, session));
    vi.stubGlobal("fetch", fetchMock);

    await expect(realAuthApi.login("a@x.com", "secret123")).resolves.toEqual(session);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/auth/login");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@x.com", password: "secret123" });
  });

  test("오류 본문의 message를 AuthRequestError 문구로 쓴다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(409, { error: "conflict", message: "이미 가입된 메일이에요" }),
      ),
    );
    await expect(realAuthApi.signup("a@x.com", "secret123", "동환")).rejects.toMatchObject({
      status: 409,
      message: "이미 가입된 메일이에요",
    });
  });

  test("본문이 JSON이 아니면 상태 코드 기본 문구로 떨어진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(realAuthApi.login("a@x.com", "secret123")).rejects.toMatchObject({
      status: 500,
      message: "",
    });
  });
});
