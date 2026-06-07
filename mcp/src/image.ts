/* ─────────────────────────────────────────────────────────────
 * moss-mcp — 이미지 입력 해석. 외부 에이전트가 로컬 파일 경로(path) 또는
 * base64(dataBase64)로 이미지를 주면, base64+mimeType로 정규화해 브리지로 넘긴다.
 *
 * OPFS는 브라우저 전용이라 실제 blob 저장(putBlob)은 moss 탭에서 일어난다.
 * 여기서는 바이트를 base64로 만들어 WS로 실어 보낼 형태만 준비한다.
 * ───────────────────────────────────────────────────────────── */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

/** WS 프레임·OPFS 부담을 막기 위한 상한(원본 바이트 기준). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface ImageInput {
  path?: string;
  dataBase64?: string;
  mimeType?: string;
}

export interface ResolvedImage {
  dataBase64: string;
  mimeType: string;
  bytes: number;
}

/** path 또는 dataBase64를 받아 {dataBase64, mimeType}로 정규화한다. 이미지가 아니면 거부. */
export async function resolveImageInput(input: ImageInput): Promise<ResolvedImage> {
  if (input.path) {
    const buf = await readFile(input.path); // 없으면 throw
    if (buf.length > MAX_IMAGE_BYTES) {
      throw new Error(`이미지가 너무 큽니다(${buf.length} bytes > ${MAX_IMAGE_BYTES}).`);
    }
    const mimeType = input.mimeType ?? EXT_MIME[extname(input.path).toLowerCase()];
    if (!mimeType) {
      throw new Error("확장자로 mimeType을 추론할 수 없습니다. mimeType을 지정하세요.");
    }
    assertImage(mimeType);
    return { dataBase64: buf.toString("base64"), mimeType, bytes: buf.length };
  }
  if (input.dataBase64) {
    if (!input.mimeType) throw new Error("dataBase64에는 mimeType이 필요합니다.");
    assertImage(input.mimeType);
    // base64 길이 → 대략 원본 바이트.
    const approx = Math.floor((input.dataBase64.length * 3) / 4);
    if (approx > MAX_IMAGE_BYTES) {
      throw new Error(`이미지가 너무 큽니다(~${approx} bytes > ${MAX_IMAGE_BYTES}).`);
    }
    return { dataBase64: input.dataBase64, mimeType: input.mimeType, bytes: approx };
  }
  throw new Error("path 또는 dataBase64 중 하나가 필요합니다.");
}

function assertImage(mimeType: string): void {
  if (!mimeType.toLowerCase().startsWith("image/")) {
    throw new Error(`이미지 MIME이 아닙니다: ${mimeType}`);
  }
}
