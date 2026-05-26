import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { summarizeTexts } from "./summarize";

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("summarizeTexts (mock 분기)", () => {
  test("키 없으면 mocked=true, tokensUsed=0, 텍스트 비지 않음", async () => {
    const r = await summarizeTexts(["오늘 책을 읽다가 졸렸다"], "flow");
    expect(r.mocked).toBe(true);
    expect(r.tokensUsed).toBe(0);
    expect(r.text.length).toBeGreaterThan(0);
  });

  test("동일 입력 → 동일 mock 텍스트 (결정성)", async () => {
    const a = await summarizeTexts(["같은 메모"], "cluster");
    const b = await summarizeTexts(["같은 메모"], "cluster");
    expect(a.text).toBe(b.text);
  });

  test("kind=flow / cluster / rhythm 라벨이 텍스트에 반영됨", async () => {
    const f = await summarizeTexts(["x"], "flow");
    const c = await summarizeTexts(["x"], "cluster");
    const r = await summarizeTexts(["x"], "rhythm");
    expect(f.text).toContain("최근 흐름");
    expect(c.text).toContain("이 군집");
    expect(r.text).toContain("사고 리듬");
  });
});

describe("summarizeTexts (Claude 분기)", () => {
  test("키 있으면 Anthropic Messages API 호출, mocked=false", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "한 두 문장 요약." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const r = await summarizeTexts(["메모1", "메모2"], "flow");
    expect(r.mocked).toBe(false);
    expect(r.text).toBe("한 두 문장 요약.");
    expect(r.tokensUsed).toBe(15);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const init2 = init as RequestInit;
    const headers = init2.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init2.body as string) as {
      model: string;
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.system).toContain("최근 메모 흐름");
    expect(body.messages[0].content).toContain("메모1");
    expect(body.messages[0].content).toContain("메모2");
  });

  test("upstream 5xx → throw", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    await expect(summarizeTexts(["x"], "flow")).rejects.toThrow(/503/);
  });
});
