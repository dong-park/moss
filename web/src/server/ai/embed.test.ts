import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { embedTexts } from "./embed";

const originalKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("embedTexts (mock 분기)", () => {
  test("키 없으면 mocked=true, 1024d 벡터", async () => {
    const r = await embedTexts(["hello"]);
    expect(r.mocked).toBe(true);
    expect(r.vectors).toHaveLength(1);
    expect(r.vectors[0]).toHaveLength(1024);
    expect(r.tokensUsed).toBe(0);
  });

  test("동일 입력 → 동일 mock 벡터 (결정성)", async () => {
    const a = await embedTexts(["같은 문장"]);
    const b = await embedTexts(["같은 문장"]);
    expect(a.vectors[0]).toEqual(b.vectors[0]);
  });

  test("mock 벡터는 L2 정규화됨 (norm ≈ 1)", async () => {
    const r = await embedTexts(["norm check"]);
    const v = r.vectors[0];
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

describe("embedTexts (OpenAI 분기)", () => {
  test("키 있으면 OpenAI fetch, mocked=false", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1024).fill(0.01) }],
        usage: { total_tokens: 5 },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const r = await embedTexts(["hi"]);
    expect(r.mocked).toBe(false);
    expect(r.tokensUsed).toBe(5);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("text-embedding-3-small");
    expect(body.dimensions).toBe(1024);
    expect(body.input).toEqual(["hi"]);
  });

  test("upstream 5xx → throw", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );
    await expect(embedTexts(["x"])).rejects.toThrow(/503/);
  });
});
