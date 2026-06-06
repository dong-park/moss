/* ─────────────────────────────────────────────────────────────
 * moss-mcp T6 — AI/preview 도구. moss의 기존 서버 라우트를 HTTP로 래핑한다.
 * 브라우저·브리지 불필요(실행 중 dev 서버만 있으면 됨).
 *
 *   POST /api/ai/embed            { texts }            → { vectors, tokensUsed, mocked }
 *   POST /api/ai/summarize        { texts, kind }      → { text, tokensUsed, mocked }
 *   POST /api/ai/connection-label { textA, textB }     → { label, tokensUsed, mocked }
 *   GET  /api/preview?url=...      (same-origin 요구)    → OG 메타
 *
 * fetcher를 주입 가능하게 해 실제 네트워크 없이 단위 테스트한다.
 * ───────────────────────────────────────────────────────────── */

type Fetcher = typeof fetch;

export interface AiOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
}

export type SummarizeKind = "flow" | "cluster" | "rhythm";

function baseUrl(o?: AiOptions): string {
  return o?.baseUrl ?? process.env.MOSS_HTTP_BASE ?? "http://localhost:3000";
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  o?: AiOptions,
): Promise<unknown> {
  const fetcher = o?.fetcher ?? fetch;
  const url = baseUrl(o) + path;
  let res: Response;
  try {
    res = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `moss 서버에 연결할 수 없습니다(${url}). dev 서버가 떠 있는지 확인하세요. (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} 실패 ${res.status}: ${detail}`);
  }
  return res.json();
}

export function aiEmbed(texts: string[], o?: AiOptions): Promise<unknown> {
  return postJson("/api/ai/embed", { texts }, o);
}

export function aiSummarize(
  texts: string[],
  kind: SummarizeKind,
  o?: AiOptions,
): Promise<unknown> {
  return postJson("/api/ai/summarize", { texts, kind }, o);
}

export function aiConnectionLabel(
  textA: string,
  textB: string,
  o?: AiOptions,
): Promise<unknown> {
  return postJson("/api/ai/connection-label", { textA, textB }, o);
}

// NOTE: /api/preview는 same-origin(Origin/Sec-Fetch-Site)만 허용하는 SSRF 가드가
// 걸려 있어 Node/Bun의 서버사이드 fetch로는 통과할 수 없다(이 헤더들은 forbidden
// header라 런타임이 제거함). 그래서 ai_preview는 HTTP가 아니라 **브리지**로 라우팅한다
// — 실행 중 moss 탭이 곧 same-origin이라 in-page fetch가 정당하게 통과한다.
// (server.ts: ai_preview → bridge.call("ai.preview"), moss: dispatchOp "ai.preview")
