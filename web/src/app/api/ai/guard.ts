/**
 * AI 라우트 공통 가드. 로그인 토큰과 분당 호출 수를 본다.
 *
 * 토큰 검사는 서버의 GET /me/usage에 맡긴다. 그 경로는 유효한 access 토큰만 200을 준다.
 * 횟수는 이 프로세스 메모리에서 사용자별로 센다. 프로세스가 여러 개면 한도가 그만큼 늘어난다.
 */

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 20;

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

/** 토큰이 유효하면 사용자 id를, 아니면 null을 준다. 테스트가 갈아끼운다. */
export type TokenChecker = (token: string) => Promise<string | null>;

async function checkWithServer(token: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/me/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("auth_unavailable");
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("auth_unavailable");
  return token;
}

/** 실서버 없이 라이브 확인할 때만 켠다. 운영 설정에는 넣지 않는다. */
const stubChecker: TokenChecker = async (token) => (token === "live-ok" ? "live-user" : null);

let checkToken: TokenChecker = process.env.MOSS_AI_TOKEN_CHECK === "stub" ? stubChecker : checkWithServer;

export function setTokenChecker(checker: TokenChecker): void {
  checkToken = checker;
}

export function limitPerMinute(): number {
  const raw = Number(process.env.MOSS_AI_LIMIT_PER_MIN);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LIMIT;
}

/** 테스트가 창을 비울 때 쓴다. */
export function resetAiLimit(): void {
  buckets.clear();
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_MOSS_API_URL ?? "http://localhost:8080";
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** 창 안에서 한도를 넘기면 true. 넘지 않으면 횟수를 하나 올리고 false. */
export function overLimit(userId: string, now: number): boolean {
  const bucket = buckets.get(userId);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(userId, { windowStart: now, count: 1 });
    return false;
  }
  if (bucket.count >= limitPerMinute()) return true;
  bucket.count += 1;
  return false;
}

/**
 * 통과하면 null. 막히면 그대로 반환할 응답.
 * 401은 토큰이 없거나 서버가 거부한 경우다. 429는 분당 한도를 넘긴 경우다.
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
