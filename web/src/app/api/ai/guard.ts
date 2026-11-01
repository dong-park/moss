/**
 * AI 라우트 공통 가드. 로그인 토큰과 분당 호출 수를 본다.
 *
 * 토큰 검사는 서버의 GET /me에 맡긴다. 서버가 서명을 검증하고 사용자 id를 돌려준다.
 * 한도 키는 그 사용자 id다. 토큰 문자열이 아니므로 토큰을 갱신해도 한도가 초기화되지 않는다.
 * 횟수는 이 프로세스 메모리에서 사용자별로 센다. 프로세스가 여러 개면 한도가 그만큼 늘어난다.
 */

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 20;
const AUTH_TIMEOUT_MS = 3_000;
/** 메모리에 두는 사용자 기록 수의 상한. 넘으면 만료분을 지우고, 그래도 가득 차면 새 사용자를 닫는다. */
const MAX_BUCKETS = 10_000;

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

/** 토큰이 유효하면 사용자 id를, 아니면 null을 준다. 장애면 던진다. 테스트가 의존성으로 주입한다. */
export type TokenChecker = (token: string) => Promise<string | null>;

async function checkWithServer(token: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("auth_unavailable");
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("auth_unavailable");
  try {
    const body = (await res.json()) as { userId?: unknown };
    if (typeof body.userId === "string" && body.userId.length > 0) return body.userId;
  } catch {
    // 아래에서 장애로 닫는다.
  }
  throw new Error("auth_unavailable");
}

let checkToken: TokenChecker = checkWithServer;

/** 테스트용 주입 지점이다. 환경 변수로는 바꿀 수 없다. */
export function setTokenChecker(checker: TokenChecker): void {
  checkToken = checker;
}

/** 테스트가 실서버 경로를 직접 볼 때 쓴다. */
export function useServerTokenChecker(): void {
  checkToken = checkWithServer;
}

export function limitPerMinute(): number {
  const raw = Number(process.env.MOSS_AI_LIMIT_PER_MIN);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LIMIT;
}

/** 테스트가 창을 비울 때 쓴다. */
export function resetAiLimit(): void {
  buckets.clear();
}

/** 테스트가 기록 수를 볼 때 쓴다. */
export function bucketCount(): number {
  return buckets.size;
}

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MOSS_API_URL;
  if (configured) return configured;
  // 운영에서 주소가 빠졌을 때 localhost로 조용히 붙지 않는다. 호출부가 503으로 닫는다.
  if (process.env.NODE_ENV === "production") throw new Error("auth_unavailable");
  return "http://localhost:8080";
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** 상한에 닿으면 창이 지난 기록만 지운다. 활성 기록은 지우지 않는다. */
function pruneExpired(now: number): void {
  for (const [id, b] of buckets) {
    if (now - b.windowStart >= WINDOW_MS) buckets.delete(id);
  }
}

/** 창 안에서 한도를 넘기면 true. 넘지 않으면 횟수를 하나 올리고 false. */
export function overLimit(userId: string, now: number): boolean {
  const bucket = buckets.get(userId);
  if (bucket && now - bucket.windowStart < WINDOW_MS) {
    if (bucket.count >= limitPerMinute()) return true;
    bucket.count += 1;
    return false;
  }
  buckets.delete(userId);
  if (buckets.size >= MAX_BUCKETS) {
    pruneExpired(now);
    // 공간이 없으면 새 사용자를 닫는다. 이미 차단된 사용자의 기록을 밀어내지 않는다.
    if (buckets.size >= MAX_BUCKETS) return true;
  }
  buckets.set(userId, { windowStart: now, count: 1 });
  return false;
}

/**
 * 통과하면 null. 막히면 그대로 반환할 응답.
 * 401은 토큰이 없거나 서버가 거부한 경우다. 429는 분당 한도를 넘긴 경우다.
 * 503은 인증 서버 장애, 시간 초과, 운영 API 주소 누락이다.
 */
export async function guardAiRequest(req: Request, now: number = Date.now()): Promise<Response | null> {
  const token = bearerToken(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  let userId: string | null;
  try {
    userId = await checkToken(token);
  } catch {
    return Response.json({ error: "auth_unavailable" }, { status: 503 });
  }
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const countedAt = Date.now();
  const limited = overLimit(userId, now);
  if (process.env.MOSS_AI_TIMING === "1") {
    console.log(`ai-guard-ms ${Date.now() - countedAt}`);
  }
  if (limited) return Response.json({ error: "rate_limited" }, { status: 429 });
  return null;
}
