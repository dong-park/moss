/**
 * 임베딩 서버 유틸 (FEAT-ai-pipeline §6).
 *
 * - OPENAI_API_KEY 있으면 text-embedding-3-small을 호출 (1024 차원)
 * - 없으면 결정적 mock 벡터(1024d, SHA-256 기반 PRNG)로 분기 → 로컬 dev / 키 누락 환경에서도 파이프라인 검증 가능
 *
 * 본문 로그 0건. 호출 결과는 pass-through(영속 저장 금지) — 응답 캐싱은 클라이언트 Dexie 책임.
 */

const EMBED_DIMS = 1024;
const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_MODEL = "text-embedding-3-small";

export interface EmbedResult {
  vectors: number[][];
  tokensUsed: number;
  mocked: boolean;
}

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  if (process.env.OPENAI_API_KEY) {
    return embedWithOpenAI(texts, process.env.OPENAI_API_KEY);
  }
  return embedWithMock(texts);
}

async function embedWithOpenAI(
  texts: string[],
  apiKey: string,
): Promise<EmbedResult> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: texts,
      dimensions: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    throw new Error(`embed upstream ${res.status}`);
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
    usage?: { total_tokens?: number };
  };
  return {
    vectors: json.data.map((d) => d.embedding),
    tokensUsed: json.usage?.total_tokens ?? 0,
    mocked: false,
  };
}

async function embedWithMock(texts: string[]): Promise<EmbedResult> {
  const vectors: number[][] = [];
  for (const t of texts) {
    vectors.push(await mockVector(t));
  }
  return { vectors, tokensUsed: 0, mocked: true };
}

async function mockVector(text: string): Promise<number[]> {
  const enc = new TextEncoder().encode(text);
  const seed = await crypto.subtle.digest("SHA-256", enc);
  const seedBytes = new Uint8Array(seed);
  const v = new Array<number>(EMBED_DIMS);
  let state = 0;
  for (let i = 0; i < seedBytes.length; i++) {
    state = (state * 31 + seedBytes[i]) >>> 0;
  }
  let sumSq = 0;
  for (let i = 0; i < EMBED_DIMS; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const x = (state / 0xffffffff) * 2 - 1;
    v[i] = x;
    sumSq += x * x;
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < EMBED_DIMS; i++) v[i] /= norm;
  return v;
}
