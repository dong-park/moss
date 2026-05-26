import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  callAISummarize,
  callAIConnectionLabel,
  configureAIClient,
} from "./client";

const successSummarize = vi.fn(async () =>
  new Response(
    JSON.stringify({ text: "요약 결과", tokensUsed: 12, mocked: false }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ),
);

const successLabel = vi.fn(async () =>
  new Response(
    JSON.stringify({ label: "독서 휴식", tokensUsed: 3, mocked: false }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ),
);

beforeEach(() => {
  successSummarize.mockClear();
  successLabel.mockClear();
});

describe("callAISummarize", () => {
  test("주입된 fetcher로 /api/ai/summarize POST", async () => {
    configureAIClient({ fetcher: successSummarize });
    const r = await callAISummarize(["메모1", "메모2"], "flow");
    expect(r.text).toBe("요약 결과");
    expect(r.tokensUsed).toBe(12);
    expect(successSummarize).toHaveBeenCalledOnce();
    const [url, init] = successSummarize.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/ai/summarize");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as {
      texts: string[];
      kind: string;
    };
    expect(body.texts).toEqual(["메모1", "메모2"]);
    expect(body.kind).toBe("flow");
  });

  test("non-2xx → throw", async () => {
    configureAIClient({
      fetcher: vi.fn(async () => new Response("err", { status: 500 })),
    });
    await expect(callAISummarize(["x"], "flow")).rejects.toThrow(/500/);
  });
});

describe("callAIConnectionLabel", () => {
  test("주입된 fetcher로 /api/ai/connection-label POST", async () => {
    configureAIClient({ fetcher: successLabel });
    const r = await callAIConnectionLabel("A", "B");
    expect(r.label).toBe("독서 휴식");
    expect(successLabel).toHaveBeenCalledOnce();
    const [url, init] = successLabel.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/ai/connection-label");
    const body = JSON.parse(init.body as string) as {
      textA: string;
      textB: string;
    };
    expect(body.textA).toBe("A");
    expect(body.textB).toBe("B");
  });

  test("non-2xx → throw", async () => {
    configureAIClient({
      fetcher: vi.fn(async () => new Response("err", { status: 502 })),
    });
    await expect(callAIConnectionLabel("A", "B")).rejects.toThrow(/502/);
  });
});
