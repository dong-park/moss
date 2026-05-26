/**
 * 자연어 요약 서버 유틸 (FEAT-ai-pipeline §6, §0 잔여).
 *
 * - ANTHROPIC_API_KEY 있으면 Claude Haiku 4.5(Messages API)를 호출 (1-2문장)
 * - 없으면 결정적 mock 요약(SHA-256 기반)으로 분기 → 로컬 dev / 키 누락 환경 검증
 *
 * 본문 로그 0건. 응답은 pass-through(영속 저장 금지) — 캐싱은 호출자 책임.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 256;

export type SummarizeKind = "flow" | "cluster" | "rhythm";

export interface SummarizeResult {
  text: string;
  tokensUsed: number;
  mocked: boolean;
}

export async function summarizeTexts(
  texts: string[],
  kind: SummarizeKind,
): Promise<SummarizeResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    return summarizeWithClaude(texts, kind, process.env.ANTHROPIC_API_KEY);
  }
  return summarizeWithMock(texts, kind);
}

function buildSystemPrompt(kind: SummarizeKind): string {
  const tone =
    "당신은 사용자의 생각을 비추는 거울입니다. 평가하지 말고, 1-2 문장의 한국어로 담담히 요약하세요.";
  if (kind === "flow") {
    return `${tone} 최근 메모 흐름의 결을 한 두 문장으로 묘사합니다.`;
  }
  if (kind === "cluster") {
    return `${tone} 한 군집을 관통하는 주제를 한 두 문장으로 압축합니다.`;
  }
  return `${tone} 시간대별 사고 리듬을 한 두 문장으로 묘사합니다.`;
}

async function summarizeWithClaude(
  texts: string[],
  kind: SummarizeKind,
  apiKey: string,
): Promise<SummarizeResult> {
  const userContent = texts.map((t, i) => `(${i + 1}) ${t}`).join("\n");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(kind),
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    throw new Error(`summarize upstream ${res.status}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = json.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  const tokensUsed =
    (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);
  return { text, tokensUsed, mocked: false };
}

async function summarizeWithMock(
  texts: string[],
  kind: SummarizeKind,
): Promise<SummarizeResult> {
  const head = texts[0]?.trim().split(/\s+/).slice(0, 6).join(" ") ?? "";
  const label =
    kind === "flow"
      ? "최근 흐름"
      : kind === "cluster"
        ? "이 군집"
        : "사고 리듬";
  const text =
    `${label}은(는) ${texts.length}개의 메모로 짜여 있어요. "${head}" 같은 결이 보입니다.`;
  // 결정적 해시: 테스트에서 동일 입력 → 동일 결과 보장
  const enc = new TextEncoder().encode(`${kind}|${texts.join("|")}`);
  await crypto.subtle.digest("SHA-256", enc);
  return { text, tokensUsed: 0, mocked: true };
}
