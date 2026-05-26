import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const originalKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

function req(body: unknown): Request {
  return new Request("http://test/api/ai/embed", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/ai/embed", () => {
  test("정상: texts 1개 → mocked vector 반환", async () => {
    const res = await POST(req({ texts: ["hello"] }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      mocked: boolean;
      vectors: number[][];
    };
    expect(json.mocked).toBe(true);
    expect(json.vectors[0]).toHaveLength(1024);
  });

  test("정상: 50개 배치 통과", async () => {
    const texts = Array.from({ length: 50 }, (_, i) => `t${i}`);
    const res = await POST(req({ texts }));
    expect(res.status).toBe(200);
  });

  test("400: invalid_json", async () => {
    const res = await POST(req("not-json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  test("400: texts 누락", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("texts_required");
  });

  test("400: 빈 배열", async () => {
    const res = await POST(req({ texts: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("texts_required");
  });

  test("400: 51개 초과", async () => {
    const texts = Array.from({ length: 51 }, (_, i) => `t${i}`);
    const res = await POST(req({ texts }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("batch_too_large");
  });

  test("400: 빈 문자열 포함", async () => {
    const res = await POST(req({ texts: ["ok", ""] }));
    expect(res.status).toBe(400);
  });

  test("400: 비문자열 포함", async () => {
    const res = await POST(req({ texts: ["ok", 123] }));
    expect(res.status).toBe(400);
  });
});
