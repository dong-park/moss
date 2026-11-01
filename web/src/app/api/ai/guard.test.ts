import { afterEach, describe, expect, test, vi } from "vitest";
import { bucketCount, guardAiRequest, overLimit, resetAiLimit, setTokenChecker, useServerTokenChecker } from "./guard";

const TOKEN = "test-token";

function authed(token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://test/api/ai/summarize", { method: "POST", headers });
}

afterEach(() => {
  resetAiLimit();
  setTokenChecker(async () => TOKEN);
});

describe("guardAiRequest", () => {
  test("토큰이 없으면 401", async () => {
    const res = await guardAiRequest(authed(null));
    expect(res?.status).toBe(401);
  });

  test("서버가 토큰을 거부하면 401", async () => {
    setTokenChecker(async () => null);
    const res = await guardAiRequest(authed(TOKEN));
    expect(res?.status).toBe(401);
  });

  test("유효한 토큰은 통과한다", async () => {
    setTokenChecker(async () => "user-1");
    const res = await guardAiRequest(authed(TOKEN));
    expect(res).toBeNull();
  });

  test("같은 사용자가 한도를 넘기면 429", async () => {
    setTokenChecker(async () => "user-1");
    process.env.MOSS_AI_LIMIT_PER_MIN = "2";
    await guardAiRequest(authed(TOKEN), 1_000);
    await guardAiRequest(authed(TOKEN), 1_000);
    const res = await guardAiRequest(authed(TOKEN), 1_000);
    delete process.env.MOSS_AI_LIMIT_PER_MIN;
    expect(res?.status).toBe(429);
  });

  test("다른 사용자는 따로 센다", async () => {
    let n = 0;
    setTokenChecker(async () => `user-${n++}`);
    process.env.MOSS_AI_LIMIT_PER_MIN = "1";
    const first = await guardAiRequest(authed(TOKEN), 1_000);
    const second = await guardAiRequest(authed(TOKEN), 1_000);
    delete process.env.MOSS_AI_LIMIT_PER_MIN;
    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

describe("overLimit", () => {
  test("창이 지나면 횟수가 초기화된다", () => {
    process.env.MOSS_AI_LIMIT_PER_MIN = "1";
    expect(overLimit("user-1", 0)).toBe(false);
    expect(overLimit("user-1", 60_000)).toBe(false);
    delete process.env.MOSS_AI_LIMIT_PER_MIN;
  });
});

describe("사용자 식별", () => {
  test("같은 사용자의 토큰 둘은 한도를 공유한다", async () => {
    setTokenChecker(async () => "user-1");
    process.env.MOSS_AI_LIMIT_PER_MIN = "2";
    await guardAiRequest(authed("token-old"), 1_000);
    await guardAiRequest(authed("token-old"), 1_000);
    const res = await guardAiRequest(authed("token-new"), 1_000);
    delete process.env.MOSS_AI_LIMIT_PER_MIN;
    expect(res?.status).toBe(429);
  });

  test("다른 사용자의 토큰은 같은 시점에도 별도 한도를 가진다", async () => {
    setTokenChecker(async (t) => (t === "token-a" ? "user-a" : "user-b"));
    process.env.MOSS_AI_LIMIT_PER_MIN = "1";
    await guardAiRequest(authed("token-a"), 1_000);
    const a = await guardAiRequest(authed("token-a"), 1_000);
    const b = await guardAiRequest(authed("token-b"), 1_000);
    delete process.env.MOSS_AI_LIMIT_PER_MIN;
    expect(a?.status).toBe(429);
    expect(b).toBeNull();
  });

  test("환경 변수로 가짜 인증을 켤 수 없다", async () => {
    vi.stubEnv("MOSS_AI_TOKEN_CHECK", "stub");
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "http://auth.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    useServerTokenChecker();
    const res = await guardAiRequest(authed("live-ok"));
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    expect(res?.status).toBe(401);
  });

  test("인증 서버 장애와 시간 초과와 깨진 응답은 503", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "http://auth.test");
    useServerTokenChecker();
    const cases: Array<() => Promise<Response>> = [
      async () => new Response("", { status: 500 }),
      async () => {
        throw new DOMException("timeout", "TimeoutError");
      },
      async () => new Response("not json", { status: 200 }),
      async () => new Response(JSON.stringify({}), { status: 200 }),
    ];
    for (const c of cases) {
      vi.stubGlobal("fetch", vi.fn(c));
      expect((await guardAiRequest(authed(TOKEN)))?.status).toBe(503);
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("서버가 준 userId로 /me를 부르고 시간 제한 신호를 단다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "http://auth.test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ userId: "u-9" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    useServerTokenChecker();
    expect(await guardAiRequest(authed(TOKEN))).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    expect(url).toBe("http://auth.test/me");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("운영에서 API 주소가 없으면 localhost로 붙지 않고 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_MOSS_API_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useServerTokenChecker();
    const res = await guardAiRequest(authed(TOKEN));
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    expect(res?.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("횟수 기록 정리", () => {
  test("만료된 기록은 상한에 닿을 때 지운다", () => {
    for (let i = 0; i < 10_000; i++) overLimit(`old-${i}`, 0);
    expect(bucketCount()).toBe(10_000);
    overLimit("fresh", 120_000);
    expect(bucketCount()).toBe(1);
  });

  test("모두 살아 있어도 기록 수는 상한을 넘지 않고 새 사용자를 닫는다", () => {
    for (let i = 0; i < 10_050; i++) overLimit(`u-${i}`, 1_000);
    expect(bucketCount()).toBe(10_000);
    expect(overLimit("late-user", 1_000)).toBe(true);
    expect(bucketCount()).toBe(10_000);
  });

  test("새 사용자 1만 명이 와도 차단된 기존 사용자는 계속 차단된다", () => {
    process.env.MOSS_AI_LIMIT_PER_MIN = "1";
    expect(overLimit("victim", 1_000)).toBe(false);
    expect(overLimit("victim", 1_000)).toBe(true);
    for (let i = 0; i < 10_000; i++) overLimit(`other-${i}`, 1_000);
    const again = overLimit("victim", 1_000);
    delete process.env.MOSS_AI_LIMIT_PER_MIN;
    expect(again).toBe(true);
  });

  test("창이 지난 기록을 지우면 새 사용자가 들어올 수 있다", () => {
    for (let i = 0; i < 10_000; i++) overLimit(`old-${i}`, 0);
    expect(overLimit("fresh", 120_000)).toBe(false);
  });
});
