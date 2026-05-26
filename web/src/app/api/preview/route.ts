import { PreviewError, fetchPreview } from "@/server/preview/fetchPreview";

/**
 * GET /api/preview?url=<encoded>
 * FEAT-capture §6 — link 카드용 Open Graph 미리보기.
 *
 * - SSRF 차단: private IP / localhost / .local / IPv4-mapped IPv6 거부 (400)
 * - 수동 redirect — 매 hop 호스트 재검증 (fetchPreview 내부)
 * - timeout 5s, 1MB max body (스트림 byte 누적)
 * - same-origin 호출만 허용 (외부 SSRF gadget 방지)
 * - 응답 영구 저장 금지 (pass-through)
 */

export const dynamic = "force-dynamic";

/**
 * 동일 origin에서 온 요청인지 검증.
 * - Sec-Fetch-Site: same-origin / same-site 허용 (브라우저 fetch가 자동 부여)
 * - Origin/Referer가 host와 일치하면 허용 (구형 브라우저 호환)
 * 그 외는 cross-origin SSRF gadget 시도로 간주.
 */
function isSameOrigin(req: Request): boolean {
  const url = new URL(req.url);
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs === "same-origin" || sfs === "same-site") return true;
  // 일부 브라우저는 navigate일 때 none을 보냄 — preview는 fetch만 허용.
  if (sfs === "none") return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === url.host;
    } catch {
      return false;
    }
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === url.host;
    } catch {
      return false;
    }
  }
  // 헤더가 전혀 없으면 거부 (외부 직접 호출)
  return false;
}

export async function GET(req: Request) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return Response.json({ error: "url_required" }, { status: 400 });
  }
  try {
    const meta = await fetchPreview(url);
    return Response.json(meta);
  } catch (err) {
    if (err instanceof PreviewError) {
      const status =
        err.code === "blocked_host" || err.code === "invalid_url" ? 400 : 502;
      return Response.json({ error: err.code }, { status });
    }
    return Response.json({ error: "fetch_failed" }, { status: 502 });
  }
}
