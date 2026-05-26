import { connectionLabel } from "@/server/ai/connectionLabel";

/**
 * POST /api/ai/connection-label (FEAT-ai-pipeline §6).
 *
 * body: { textA: string; textB: string }
 * res : { label: string; tokensUsed: number; mocked: boolean }
 *
 * - 본문 로그 0건. 오류는 generic 메시지.
 * - 인증/쿼터는 FEAT-freemium에서 추후 추가.
 */

export const dynamic = "force-dynamic";

const MAX_TEXT_LEN = 4000;

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = payload as { textA?: unknown; textB?: unknown };
  const { textA, textB } = body;

  if (typeof textA !== "string" || typeof textB !== "string") {
    return Response.json({ error: "texts_required" }, { status: 400 });
  }
  if (textA.length === 0 || textB.length === 0) {
    return Response.json({ error: "texts_required" }, { status: 400 });
  }
  if (textA.length > MAX_TEXT_LEN || textB.length > MAX_TEXT_LEN) {
    return Response.json({ error: "text_too_long" }, { status: 400 });
  }

  try {
    const result = await connectionLabel(textA, textB);
    return Response.json(result);
  } catch {
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }
}
