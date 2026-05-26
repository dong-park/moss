import { summarizeTexts, type SummarizeKind } from "@/server/ai/summarize";

/**
 * POST /api/ai/summarize (FEAT-ai-pipeline §6).
 *
 * body: { texts: string[]; kind: "flow" | "cluster" | "rhythm" }
 * res : { text: string; tokensUsed: number; mocked: boolean }
 *
 * - 본문 로그 0건. 오류는 generic 메시지.
 * - 인증/쿼터는 FEAT-freemium에서 추후 추가.
 */

export const dynamic = "force-dynamic";

const MAX_BATCH = 50;
const KINDS: ReadonlySet<SummarizeKind> = new Set([
  "flow",
  "cluster",
  "rhythm",
]);

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = payload as { texts?: unknown; kind?: unknown };
  const texts = body.texts;
  const kind = body.kind;

  if (!Array.isArray(texts) || texts.length === 0) {
    return Response.json({ error: "texts_required" }, { status: 400 });
  }
  if (texts.length > MAX_BATCH) {
    return Response.json({ error: "batch_too_large" }, { status: 400 });
  }
  if (!texts.every((t) => typeof t === "string" && t.length > 0)) {
    return Response.json(
      { error: "texts_must_be_nonempty_strings" },
      { status: 400 },
    );
  }
  if (typeof kind !== "string" || !KINDS.has(kind as SummarizeKind)) {
    return Response.json({ error: "invalid_kind" }, { status: 400 });
  }

  try {
    const result = await summarizeTexts(texts as string[], kind as SummarizeKind);
    return Response.json(result);
  } catch {
    return Response.json({ error: "upstream_failed" }, { status: 502 });
  }
}
