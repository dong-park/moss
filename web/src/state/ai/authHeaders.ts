import { useAuth } from "@/state/auth/store";

/**
 * AI 라우트에 보낼 헤더. 로그인 세션이 있으면 갱신된 access 토큰을 Bearer로 단다.
 * ensureSession이 만료 직전 토큰을 갱신하므로 저장된 옛 토큰을 그대로 보내지 않는다.
 * 세션이 없거나 갱신에 실패하면 토큰 없이 보낸다. 서버가 401로 막는다.
 */
export async function aiAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const session = await useAuth.getState().ensureSession();
    headers.Authorization = `Bearer ${session.accessToken}`;
  } catch {
    // 로그인 전이거나 세션이 끝났다.
  }
  return headers;
}
