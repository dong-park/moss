/**
 * 링크 미리보기 fetcher — FEAT-capture §6 link editor 백엔드.
 *
 * - http/https만 허용.
 * - private/loopback/link-local IP·도메인 차단 (SSRF 방지).
 *   IPv4-mapped IPv6(`::ffff:127.0.0.1`)도 포함.
 * - 리다이렉트 수동 처리 — 매 hop마다 차단 호스트 재검증, 5회 cap.
 * - 5초 timeout, 1MB max body — gzip bomb 차단 위해 디컴프레션 byte 누적 측정.
 * - Open Graph (og:*) 우선, <title>·description fallback.
 * - 외부 HTML은 정규식 파싱 — cheerio/jsdom 의존성 없음.
 */

export interface PreviewMeta {
  url: string;
  title?: string;
  summary?: string;
  thumbUrl?: string;
}

export interface FetchPreviewOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** redirect hop 최대 수 (기본 5). */
  maxRedirects?: number;
  /** 테스트용 fetch 주입. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT = 5_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "[::1]",
  "::ffff:127.0.0.1",
  "[::ffff:127.0.0.1]",
  // IPv4-compatible IPv6 (deprecated per RFC 4291 §2.5.5.1) loopback —
  // 대부분 OS에서 비활성화이나 defense-in-depth.
  "::127.0.0.1",
  "[::127.0.0.1]",
]);

const BLOCKED_SUFFIXES = [".local", ".lan", ".internal", ".localhost"];

/** RFC1918 / link-local / loopback IPv4 차단. */
function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * IPv4-embedded IPv6 → IPv4 추출 후 private 체크.
 * URL 생성자가 hostname을 정규화하므로 여러 형태를 모두 받는다:
 *   - IPv4-mapped dotted: `::ffff:127.0.0.1` (사용자 입력)
 *   - IPv4-mapped hex:    `::ffff:7f00:1`   (URL 정규화 결과)
 *   - IPv4-compatible dotted: `::127.0.0.1` (deprecated, 사용자 입력)
 *   - IPv4-compatible hex:    `::7f00:1`   (URL 정규화 결과 — 가장 흔한 우회 경로)
 */
function isEmbeddedIPv4Private(host: string): boolean {
  const stripped = host.replace(/^\[|\]$/g, "");
  // IPv4-mapped (::ffff:...)
  let m = stripped.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (m) return isPrivateIPv4(m[1]);
  m = stripped.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (m) return isPrivateIPv4(hexPairToIPv4(m[1], m[2]));
  // IPv4-compatible (::...) — deprecated이나 URL 정규화로 hex form은 흔히 생성됨
  m = stripped.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (m) return isPrivateIPv4(m[1]);
  m = stripped.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (m) return isPrivateIPv4(hexPairToIPv4(m[1], m[2]));
  return false;
}

function hexPairToIPv4(h1: string, h2: string): string {
  const n1 = parseInt(h1, 16);
  const n2 = parseInt(h2, 16);
  return `${(n1 >> 8) & 0xff}.${n1 & 0xff}.${(n2 >> 8) & 0xff}.${n2 & 0xff}`;
}

export class PreviewError extends Error {
  code:
    | "invalid_url"
    | "blocked_host"
    | "timeout"
    | "fetch_failed"
    | "too_large"
    | "too_many_redirects";
  constructor(code: PreviewError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PreviewError";
  }
}

/** URL 검증 + 호스트 차단. 에러는 throw로. 매 redirect hop마다 재호출. */
export function validatePreviewUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PreviewError("invalid_url", "URL 형식 아님");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PreviewError("invalid_url", "http/https만 허용");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new PreviewError("blocked_host", "차단된 호스트");
  }
  if (BLOCKED_SUFFIXES.some((suf) => host.endsWith(suf))) {
    throw new PreviewError("blocked_host", "차단된 호스트");
  }
  if (isPrivateIPv4(host)) {
    throw new PreviewError("blocked_host", "private IP 차단");
  }
  if (isEmbeddedIPv4Private(host)) {
    throw new PreviewError("blocked_host", "private IPv4-embedded IPv6 차단");
  }
  return url;
}

/**
 * HTML에서 OG 메타 + title 추출.
 * 정규식 기반 — robust 파서 아님. 일반적인 OG 헤더 대응.
 */
export function extractMeta(
  html: string,
  baseUrl: URL,
): Omit<PreviewMeta, "url"> {
  const meta: Omit<PreviewMeta, "url"> = {};

  const ogTitle = findMeta(html, "og:title");
  if (ogTitle) meta.title = ogTitle;
  else {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t) meta.title = decodeEntities(t[1].trim()).slice(0, 200);
  }

  const ogDesc =
    findMeta(html, "og:description") ?? findMeta(html, "description", "name");
  if (ogDesc) meta.summary = ogDesc.slice(0, 500);

  const ogImage = findMeta(html, "og:image");
  if (ogImage) {
    try {
      meta.thumbUrl = new URL(ogImage, baseUrl).toString();
    } catch {
      /* invalid og:image — drop */
    }
  }

  return meta;
}

function findMeta(
  html: string,
  value: string,
  attr: "property" | "name" = "property",
): string | undefined {
  const re = new RegExp(
    `<meta[^>]+${attr}\\s*=\\s*["']${escapeRe(value)}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1].trim());
  // attr 순서가 반대인 경우
  const re2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*${attr}\\s*=\\s*["']${escapeRe(value)}["']`,
    "i",
  );
  const m2 = html.match(re2);
  if (m2) return decodeEntities(m2[1].trim());
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * 응답 본문을 스트림으로 읽어 디컴프레션 후 누적 byte를 측정.
 * 한도 초과 시 reader 취소.
 */
async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    return await res.text();
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PreviewError("too_large", "응답 너무 큼");
      }
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

export async function fetchPreview(
  input: string,
  opts: FetchPreviewOptions = {},
): Promise<PreviewMeta> {
  let url = validatePreviewUrl(input);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const f = opts.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 수동 리다이렉트 — 매 hop마다 호스트 재검증으로 SSRF 차단.
    let res: Response;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      res = await f(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "moss-preview/1.0",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        // 응답 본문이 큰 경우 메모리 절약 위해 cancel
        try {
          await res.body?.cancel();
        } catch {
          /* noop */
        }
        if (hop === maxRedirects) {
          throw new PreviewError("too_many_redirects", "redirect 횟수 초과");
        }
        const next = new URL(loc, url);
        url = validatePreviewUrl(next.toString());
        continue;
      }
      // 2xx 또는 4xx/5xx — 정상 응답 처리로 진입
      break;
    }
    // res는 위에서 항상 할당됨 (loop 본문에서 break 또는 throw 전에 set)
    res = res!;
    if (!res.ok) {
      return { url: url.toString() };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ctype)) {
      try {
        await res.body?.cancel();
      } catch {
        /* noop */
      }
      return { url: url.toString() };
    }
    // content-length 사전 거부 + 스트림 byte 누적 한도
    const cl = Number(res.headers.get("content-length") ?? "0");
    if (cl > maxBytes) {
      try {
        await res.body?.cancel();
      } catch {
        /* noop */
      }
      throw new PreviewError("too_large", "응답 너무 큼");
    }
    const text = await readBoundedText(res, maxBytes);
    return { url: url.toString(), ...extractMeta(text, url) };
  } catch (err) {
    if (err instanceof PreviewError) throw err;
    const name = (err as { name?: string }).name;
    if (name === "AbortError") throw new PreviewError("timeout", "timeout");
    throw new PreviewError("fetch_failed", "fetch failed");
  } finally {
    clearTimeout(timer);
  }
}
