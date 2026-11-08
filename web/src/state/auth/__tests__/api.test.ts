import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApiConfigError,
  AuthRequestError,
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

    await expect(realAuthApi.signup("a@x.com", "secret123", "동환", "v1")).resolves.toEqual(session);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/auth/signup");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@x.com",
      password: "secret123",
      name: "동환",
      termsAccepted: true,
      termsVersion: "v1",
    });
  });

  test("googleLogin은 기본으로 동의 값을 보내지 않고, 버전을 주면 명시적 동의로 보낸다", async () => {
    const session = { accessToken: "a", refreshToken: "r", user: { id: "u1", name: "동환", avatar: null } };
    const fetchMock = vi.fn(async () => jsonResponse(200, session));
    vi.stubGlobal("fetch", fetchMock);

    await realAuthApi.googleLogin("tok");
    await realAuthApi.googleLogin("tok", "v1");
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0]).toEqual({ idToken: "tok" });
    expect(bodies[1]).toEqual({ idToken: "tok", termsAccepted: true, termsVersion: "v1" });
  });

  test("오류 본문의 error 코드를 AuthRequestError.code로 올린다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(400, { error: "consent_required", message: "약관에 동의해야 가입할 수 있어요" })),
    );
    await expect(realAuthApi.googleLogin("tok")).rejects.toMatchObject({
      status: 400,
      code: "consent_required",
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
    await expect(realAuthApi.signup("a@x.com", "secret123", "동환", "v1")).rejects.toMatchObject({
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

  test("googleLogin은 fetch가 끝나지 않으면 15초에 timeout 오류로 끝난다", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            }),
        ),
      );
      const result = realAuthApi.googleLogin("tok").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(14_999);
      let settled = false;
      void result.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const err = (await result) as AuthRequestError;
      expect(err).toBeInstanceOf(AuthRequestError);
      expect(err.code).toBe("timeout");
      expect(err.status).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("googleLogin은 헤더 뒤 본문이 멈춰도 15초에 timeout 오류로 끝난다", async () => {
    vi.useFakeTimers();
    try {
      // 본문 스트림이 abort를 무시하는 경우다. 성공 본문과 오류 본문 둘 다 마감이 끊어야 한다.
      for (const status of [200, 500]) {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => new Response(new ReadableStream({ start() {} }), { status })),
        );
        const result = realAuthApi.googleLogin("tok").catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(15_000);
        const err = (await result) as AuthRequestError;
        expect(err).toBeInstanceOf(AuthRequestError);
        expect(err.code).toBe("timeout");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  test("login·signup 호출의 fetch 옵션에는 signal이 없다", async () => {
    const session = { accessToken: "a", refreshToken: "r", user: { id: "u1", name: "동환", avatar: null } };
    const fetchMock = vi.fn(async () => jsonResponse(200, session));
    vi.stubGlobal("fetch", fetchMock);
    await realAuthApi.login("a@x.com", "secret123");
    await realAuthApi.signup("a@x.com", "secret123", "동환", "v1");
    for (const call of fetchMock.mock.calls) {
      expect((call as unknown as [string, RequestInit])[1]).not.toHaveProperty("signal");
    }
  });
});
