/**
 * FEAT-sticky-redesign 2단계 리뷰 P1-6 — 첨부 한도·지원 형식 단일 출처.
 *
 * 이전에는 imagePaste.ts·BlockMenu.tsx·canvasCapture.ts가 각자 10MB/50MB/20개/
 * 지원 이미지 타입을 따로 선언해 세 곳이 어긋날 여지가 있었다. 이 모듈이 유일한
 * 출처이고, 나머지는 여기서만 import한다.
 */

/** 이미지 블록·인라인 이미지 붙여넣기 한도. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 녹음·파일 블록 한도(spec §4 경계 조건). */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** 캔버스에 한 번에 떨어뜨릴 수 있는 파일 개수(spec §4 경계 조건). */
export const MAX_DROP_FILES = 20;

/** 인라인 삽입을 허용하는 이미지 MIME. 그 외는 경고 후 무시. */
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
