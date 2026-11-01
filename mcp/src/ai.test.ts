import { describe, test, expect } from "bun:test";
import { aiEmbed, aiSummarize, aiConnectionLabel } from "./ai.ts";

/** 요청을 캡처하고 정해둔 응답을 돌려주는 fake fetch. */
function fakeFetch(
  responder: (url: string, init?: RequestInit) => { status?: number; body: unknown },
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = responder(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

const base = "http://localhost:3000";

describe("ai 도구", () => {
  test("aiEmbed → /api/ai/embed 로 texts POST", async () => {
    const { fetcher, calls } = fakeFetch(() => ({ body: { vectors: [[1, 2]], tokensUsed: 3 } }));
    const r = await aiEmbed(["hi"], { baseUrl: base, fetcher });
    expect(r).toEqual({ vectors: [[1, 2]], tokensUsed: 3 });
    expect(calls[0]!.url).toBe(`${base}/api/ai/embed`);
    expect(calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ texts: ["hi"] });
  });

  test("aiSummarize → kind 동봉", async () => {
    const { fetcher, calls } = fakeFetch(() => ({ body: { text: "요약" } }));
    await aiSummarize(["a", "b"], "flow", { baseUrl: base, fetcher });
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ texts: ["a", "b"], kind: "flow" });
  });

  test("aiConnectionLabel → textA/textB POST", async () => {
    const { fetcher, calls } = fakeFetch(() => ({ body: { label: "관련" } }));
    const r = await aiConnectionLabel("x", "y", { baseUrl: base, fetcher });
    expect(r).toEqual({ label: "관련" });
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ textA: "x", textB: "y" });
  });

  test("non-ok 응답 → 에러", async () => {
    const { fetcher } = fakeFetch(() => ({ status: 400, body: { error: "texts_required" } }));
    await expect(aiEmbed(["x"], { baseUrl: base, fetcher })).rejects.toThrow("400");
  });

  test("연결 실패 → 친절한 메시지", async () => {
    const fetcher = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(aiEmbed(["x"], { baseUrl: base, fetcher })).rejects.toThrow("연결할 수 없습니다");
  });
});

describe("ai 도구 — 브리지 경로(로그인 세션)", () => {
  function fakeBridge(result: unknown = { ok: 1 }) {
    const calls: { op: string; params?: Record<string, unknown> }[] = [];
    return { calls, call: async (op: string, params?: Record<string, unknown>) => (calls.push({ op, params }), result) };
  }
  const noFetch = (async () => {
    throw new Error("HTTP를 타면 안 된다");
  }) as unknown as typeof fetch;

  test("embed → ai.embed op, HTTP 미사용", async () => {
    const bridge = fakeBridge();
    await aiEmbed(["a"], { bridge, fetcher: noFetch });
    expect(bridge.calls).toEqual([{ op: "ai.embed", params: { texts: ["a"] } }]);
  });

  test("summarize → ai.summarize op", async () => {
    const bridge = fakeBridge();
    await aiSummarize(["a"], "rhythm", { bridge, fetcher: noFetch });
    expect(bridge.calls).toEqual([{ op: "ai.summarize", params: { texts: ["a"], kind: "rhythm" } }]);
  });

  test("connection-label → ai.connectionLabel op", async () => {
    const bridge = fakeBridge();
    await aiConnectionLabel("x", "y", { bridge, fetcher: noFetch });
    expect(bridge.calls).toEqual([{ op: "ai.connectionLabel", params: { textA: "x", textB: "y" } }]);
  });

  test("탭 미접속 오류가 그대로 올라온다", async () => {
    const bridge = { call: async () => Promise.reject(new Error("실행 중인 moss 탭이 브리지에 접속하지 않았습니다.")) };
    await expect(aiEmbed(["a"], { bridge })).rejects.toThrow("moss 탭");
  });
});
