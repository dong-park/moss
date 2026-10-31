import { afterEach, describe, expect, test } from "vitest";
import { guardAiRequest, overLimit, resetAiLimit, setTokenChecker } from "./guard";

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
