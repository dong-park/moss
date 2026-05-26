/**
 * 두 메모 본문 → 1-3 단어 연결 라벨 서버 유틸 (FEAT-ai-pipeline §6, §0 잔여).
 *
 * - ANTHROPIC_API_KEY 있으면 Claude Haiku 4.5 호출
 * - 없으면 결정적 mock: 공통 토큰 → 없으면 "관련 메모"
 *
 * 본문 로그 0건. 응답은 pass-through.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 32;

export interface ConnectionLabelResult {
  label: string;
  tokensUsed: number;
  mocked: boolean;
}

export async function connectionLabel(
  textA: string,
  textB: string,
): Promise<ConnectionLabelResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    return labelWithClaude(textA, textB, process.env.ANTHROPIC_API_KEY);
  }
  return labelWithMock(textA, textB);
}

async function labelWithClaude(
  textA: string,
  textB: string,
  apiKey: string,
): Promise<ConnectionLabelResult> {
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
      system:
        "두 메모를 잇는 핵심 키워드를 1~3개의 짧은 한국어 단어로만 답하세요. 문장이나 설명, 따옴표, 마침표 금지.",
      messages: [
        {
          role: "user",
          content: `메모 A:\n${textA}\n\n메모 B:\n${textB}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`connection-label upstream ${res.status}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const raw = json.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  const label = sanitizeLabel(raw);
  const tokensUsed =
    (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);
  return { label, tokensUsed, mocked: false };
}

async function labelWithMock(
  textA: string,
  textB: string,
): Promise<ConnectionLabelResult> {
  const tokensA = tokenize(textA);
  const tokensB = new Set(tokenize(textB));
  const shared = tokensA.filter((t) => tokensB.has(t)).slice(0, 3);
  const label = shared.length > 0 ? shared.join(" ") : "관련 메모";
  // 결정적 해시 (테스트 안정성)
  const enc = new TextEncoder().encode(`${textA}|${textB}`);
  await crypto.subtle.digest("SHA-256", enc);
  return { label, tokensUsed: 0, mocked: true };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function sanitizeLabel(raw: string): string {
  const cleaned = raw
    .replace(/["'`.,!?]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  return cleaned.length > 0 ? cleaned : "관련 메모";
}
