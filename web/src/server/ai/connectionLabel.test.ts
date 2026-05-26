import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { connectionLabel } from "./connectionLabel";

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("connectionLabel (mock 분기)", () => {
  test("키 없으면 mocked=true, 공통 토큰을 라벨로", async () => {
    const r = await connectionLabel(
      "독서 노트 휴식",
      "독서 휴식 카페",
    );
    expect(r.mocked).toBe(true);
    expect(r.label).toContain("독서");
    expect(r.label).toContain("휴식");
  });

  test("공통 토큰 없으면 fallback '관련 메모'", async () => {
    const r = await connectionLabel("apple banana", "lion tiger");
    expect(r.label).toBe("관련 메모");
  });

  test("결정적: 동일 입력 → 동일 라벨", async () => {
    const a = await connectionLabel("같은 텍스트", "같은 텍스트 비교");
    const b = await connectionLabel("같은 텍스트", "같은 텍스트 비교");
    expect(a.label).toBe(b.label);
  });
});

describe("connectionLabel (Claude 분기)", () => {
  test("키 있으면 Anthropic 호출, 라벨 sanitize", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: '"독서, 휴식."' }],
        usage: { input_tokens: 8, output_tokens: 2 },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const r = await connectionLabel("A 본문", "B 본문");
    expect(r.mocked).toBe(false);
    expect(r.label).toBe("독서 휴식");
    expect(r.tokensUsed).toBe(10);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse((init as RequestInit).body as string) as {
      model: string;
      system: string;
      max_tokens: number;
    };
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.system).toContain("1~3개");
    expect(body.max_tokens).toBe(32);
  });

  test("Claude가 4단어 이상 반환 시 3단어로 자름", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "한 두 세 네 다섯" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      } as Response),
    );
    const r = await connectionLabel("A", "B");
    expect(r.label).toBe("한 두 세");
  });

  test("upstream 5xx → throw", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response),
    );
    await expect(connectionLabel("A", "B")).rejects.toThrow(/500/);
  });
});
