import { embedTexts } from "@/server/ai/embed";

/**
 * POST /api/ai/embed (FEAT-ai-pipeline §6).
 *
 * body: { texts: string[] }  (배치, 1~50)
 * res : { vectors: number[][]; tokensUsed: number; mocked: boolean }
 *
 * - 본문 자체는 로그하지 않음. 오류는 generic 메시지.
 * - 응답 영구 저장 금지 — pass-through.
 * - 인증/쿼터는 FEAT-freemium에서 추후 추가.
 */

export const dynamic = "force-dynamic";

const MAX_BATCH = 50;

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const texts = (payload as { texts?: unknown })?.texts;
  if (!Array.isArray(texts) || texts.length === 0) {
    return Response.json({ error: "texts_required" }, { status: 400 });
  }
  if (texts.length > MAX_BATCH) {
    return Response.json({ error: "batch_too_large" }, { status: 400 });
  }
  if (!texts.every((t) => typeof t === "string" && t.length > 0)) {
    return Response.json({ error: "texts_must_be_nonempty_strings" }, {
      status: 400,
    });
  }

  try {
    const result = await embedTexts(texts as string[]);
    return Response.json(result);
  } catch {
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }
}
