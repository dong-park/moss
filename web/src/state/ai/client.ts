/**
 * AI 엔드포인트 단일 fetch 진입점 (FEAT-ai-pipeline §6, §0).
 *
 * ESLint `no-restricted-syntax`는 `fetch("/api/ai/...")` 리터럴 호출만 차단한다.
 * 본 모듈은 주입된 `deps.fetcher`를 호출하므로 selector에 잡히지 않으며,
 * 모든 manual AI 호출의 단일 통로로 작동한다.
 *
 * 자동 임베딩 큐는 `embeddingQueue.ts`에 별도 진입점이 있다.
 */

import type { SummarizeKind } from "@/server/ai/summarize";

interface AIClientDeps {
  fetcher: typeof fetch;
}

let deps: AIClientDeps = {
  fetcher: typeof fetch === "function" ? fetch : (async () => {
    throw new Error("fetch unavailable");
  }) as typeof fetch,
};

export function configureAIClient(next: Partial<AIClientDeps>) {
  deps = { ...deps, ...next };
}

export interface SummarizeResponse {
  text: string;
  tokensUsed: number;
  mocked: boolean;
}

export interface ConnectionLabelResponse {
  label: string;
  tokensUsed: number;
  mocked: boolean;
}

export async function callAISummarize(
  texts: string[],
  kind: SummarizeKind,
): Promise<SummarizeResponse> {
  const res = await deps.fetcher("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, kind }),
  });
  if (!res.ok) throw new Error(`summarize ${res.status}`);
  return (await res.json()) as SummarizeResponse;
}

export async function callAIConnectionLabel(
  textA: string,
  textB: string,
): Promise<ConnectionLabelResponse> {
  const res = await deps.fetcher("/api/ai/connection-label", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ textA, textB }),
  });
  if (!res.ok) throw new Error(`connection-label ${res.status}`);
  return (await res.json()) as ConnectionLabelResponse;
}
