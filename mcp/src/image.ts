/* ─────────────────────────────────────────────────────────────
 * moss-mcp — 첨부(이미지/오디오/파일) 입력 해석. 외부 에이전트가 로컬 파일
 * 경로(path) 또는 base64(dataBase64)로 미디어를 주면, base64+mimeType로 정규화해
 * 브리지로 넘긴다.
 *
 * OPFS는 브라우저 전용이라 실제 blob 저장(putBlob)은 moss 탭에서 일어난다.
 * 여기서는 바이트를 base64로 만들어 WS로 실어 보낼 형태만 준비한다.
 * ───────────────────────────────────────────────────────────── */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const EXT_MIME: Record<string, string> = {
  // image
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  // audio
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".weba": "audio/webm",
  // file (common)
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
};

/** 어떤 미디어를 허용할지. file은 무엇이든 허용(any). */
export type MediaKind = "image" | "audio" | "any";

/** WS 프레임·OPFS 부담을 막기 위한 상한(원본 바이트 기준). */
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
/** @deprecated MAX_MEDIA_BYTES 사용 — 하위호환 별칭. */
export const MAX_IMAGE_BYTES = MAX_MEDIA_BYTES;

export interface MediaInput {
  path?: string;
  dataBase64?: string;
  mimeType?: string;
}

export interface ResolvedMedia {
  dataBase64: string;
  mimeType: string;
  bytes: number;
}

/** path 또는 dataBase64를 받아 {dataBase64, mimeType}로 정규화한다. allow에 맞지 않으면 거부. */
export async function resolveMediaInput(
  input: MediaInput,
  allow: MediaKind,
): Promise<ResolvedMedia> {
  if (input.path) {
    const buf = await readFile(input.path); // 없으면 throw
    if (buf.length > MAX_MEDIA_BYTES) {
      throw new Error(`첨부가 너무 큽니다(${buf.length} bytes > ${MAX_MEDIA_BYTES}).`);
    }
    const mimeType = input.mimeType ?? inferMime(input.path, allow);
    assertAllowed(mimeType, allow);
    return { dataBase64: buf.toString("base64"), mimeType, bytes: buf.length };
  }
  if (input.dataBase64) {
    const mimeType = input.mimeType ?? (allow === "any" ? "application/octet-stream" : undefined);
    if (!mimeType) throw new Error("dataBase64에는 mimeType이 필요합니다.");
    assertAllowed(mimeType, allow);
    const approx = Math.floor((input.dataBase64.length * 3) / 4);
    if (approx > MAX_MEDIA_BYTES) {
      throw new Error(`첨부가 너무 큽니다(~${approx} bytes > ${MAX_MEDIA_BYTES}).`);
    }
    return { dataBase64: input.dataBase64, mimeType, bytes: approx };
  }
  throw new Error("path 또는 dataBase64 중 하나가 필요합니다.");
}

/** 이미지 전용 — 하위호환. */
export function resolveImageInput(input: MediaInput): Promise<ResolvedMedia> {
  return resolveMediaInput(input, "image");
}

/** 원격 이미지 URL을 받아 base64+mimeType로. OG 썸네일을 메모에 인라인 박을 때 사용. */
export async function fetchImageAsBase64(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedMedia> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`이미지 fetch 실패 ${res.status}: ${url}`);
  const mimeType = (res.headers.get("content-type") ?? "application/octet-stream")
    .split(";")[0]!
    .trim();
  assertAllowed(mimeType, "image");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) {
    throw new Error(`썸네일이 너무 큽니다(${buf.length} bytes).`);
  }
  return { dataBase64: buf.toString("base64"), mimeType, bytes: buf.length };
}

function inferMime(path: string, allow: MediaKind): string {
  const mime = EXT_MIME[extname(path).toLowerCase()];
  if (mime) return mime;
  if (allow === "any") return "application/octet-stream";
  throw new Error("확장자로 mimeType을 추론할 수 없습니다. mimeType을 지정하세요.");
}

function assertAllowed(mimeType: string, allow: MediaKind): void {
  const m = mimeType.toLowerCase();
  if (allow === "image" && !m.startsWith("image/")) {
    throw new Error(`이미지 MIME이 아닙니다: ${mimeType}`);
  }
  if (allow === "audio" && !m.startsWith("audio/")) {
    throw new Error(`오디오 MIME이 아닙니다: ${mimeType}`);
  }
}
