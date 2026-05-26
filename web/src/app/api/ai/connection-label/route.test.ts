import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

function req(body: unknown): Request {
  return new Request("http://test/api/ai/connection-label", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/ai/connection-label", () => {
  test("정상: 공통 토큰을 라벨로 반환", async () => {
    const res = await POST(
      req({ textA: "독서 노트", textB: "독서 휴식" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      mocked: boolean;
      label: string;
      tokensUsed: number;
    };
    expect(json.mocked).toBe(true);
    expect(json.label).toContain("독서");
    expect(json.tokensUsed).toBe(0);
  });

  test("정상: 공통 토큰 없으면 fallback", async () => {
    const res = await POST(req({ textA: "apple", textB: "lion" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.label).toBe("관련 메모");
  });

  test("400: invalid_json", async () => {
    const res = await POST(req("not-json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  test("400: textA 누락", async () => {
    const res = await POST(req({ textB: "b" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("texts_required");
  });

  test("400: textB 빈 문자열", async () => {
    const res = await POST(req({ textA: "a", textB: "" }));
    expect(res.status).toBe(400);
  });

  test("400: 비문자열", async () => {
    const res = await POST(req({ textA: 1, textB: "b" }));
    expect(res.status).toBe(400);
  });

  test("400: text_too_long", async () => {
    const long = "a".repeat(4001);
    const res = await POST(req({ textA: long, textB: "b" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("text_too_long");
  });
});
