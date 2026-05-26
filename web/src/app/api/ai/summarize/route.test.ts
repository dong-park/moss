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
  return new Request("http://test/api/ai/summarize", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/ai/summarize", () => {
  test("정상: kind=flow → mocked 응답", async () => {
    const res = await POST(req({ texts: ["메모1"], kind: "flow" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      mocked: boolean;
      text: string;
      tokensUsed: number;
    };
    expect(json.mocked).toBe(true);
    expect(json.text.length).toBeGreaterThan(0);
    expect(json.tokensUsed).toBe(0);
  });

  test("정상: 50개 배치 통과", async () => {
    const texts = Array.from({ length: 50 }, (_, i) => `t${i}`);
    const res = await POST(req({ texts, kind: "cluster" }));
    expect(res.status).toBe(200);
  });

  test("400: invalid_json", async () => {
    const res = await POST(req("not-json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  test("400: texts 누락", async () => {
    const res = await POST(req({ kind: "flow" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("texts_required");
  });

  test("400: 빈 배열", async () => {
    const res = await POST(req({ texts: [], kind: "flow" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("texts_required");
  });

  test("400: 51개 초과", async () => {
    const texts = Array.from({ length: 51 }, (_, i) => `t${i}`);
    const res = await POST(req({ texts, kind: "flow" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("batch_too_large");
  });

  test("400: 빈 문자열 포함", async () => {
    const res = await POST(req({ texts: ["ok", ""], kind: "flow" }));
    expect(res.status).toBe(400);
  });

  test("400: invalid_kind", async () => {
    const res = await POST(req({ texts: ["x"], kind: "wrong" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_kind");
  });

  test("400: kind 누락", async () => {
    const res = await POST(req({ texts: ["x"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_kind");
  });
});
