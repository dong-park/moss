/**
 * JWT payload 디코딩 — 만료 판단에만 쓴다. 서명 검증은 서버가 한다.
 * 네트워크를 부르지 않으므로 로그인 안 한 경로에서도 안전하다.
 */
export interface JwtClaims {
  exp?: number;
  sub?: string;
  typ?: string;
  boardId?: string;
}

function base64UrlDecode(segment: string): string {
  const pad = segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 서명 검증 없이 payload만 읽는다. 형식이 아니면 null. */
export function decodeJwtPayload(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * exp가 지났으면 true. exp가 없거나 디코딩 불가면 만료로 취급한다(안전측).
 * [skewMs]는 만료 직전 선제 갱신 여유.
 */
export function isExpired(token: string, skewMs = 0, now = Date.now()): boolean {
  const claims = decodeJwtPayload(token);
  if (typeof claims?.exp !== "number") return true;
  return claims.exp * 1000 <= now + skewMs;
}
