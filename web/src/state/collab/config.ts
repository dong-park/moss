/**
 * FEAT-collab-auth n7 — Hocuspocus sync 서버 주소.
 *
 * n6의 `apiBaseUrl`과 같은 규칙: dev는 localhost 폴백, production은 설정 누락을
 * 첫 요청 때 드러낸다. 로그인 안 한 경로는 이 함수를 부르지 않으므로 AC-1은 그대로다.
 */
export function syncUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MOSS_SYNC_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_MOSS_SYNC_URL이 설정되지 않았어요");
  }
  return "ws://localhost:1234";
}
