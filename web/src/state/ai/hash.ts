/**
 * 메모 본문 콘텐츠 해시 (FEAT-ai-pipeline AC-4).
 *
 * 동일 본문이면 동일 해시 → embeddings 테이블 캐시 hit 시 재호출 0회.
 * 본문이 미세 변경되어도 다른 해시가 되도록 SHA-256 사용.
 *
 * Web Crypto는 브라우저(jsdom 포함) + Node 19+ 표준. 폴리필 불필요.
 */

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === "function") return btoa(bin);
  return Buffer.from(bytes).toString("base64");
}

export async function contentHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bytesToBase64(new Uint8Array(buf));
}
