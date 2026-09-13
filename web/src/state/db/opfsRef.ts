/**
 * OPFS 참조 스킴 변환 — 순수 함수(에디터·Milkdown 의존 없음).
 *
 * 어댑터(state/db/opfs)는 `opfs:<file>`(콜론 1개), 마크다운 본문은
 * `opfs://<file>`(콜론+슬래시 2개)을 쓴다. imagePaste.ts(에디터)와
 * state/blocks.ts(순수 모듈)가 함께 쓴다.
 */

/** 마크다운 본문에 들어가는 URL 스킴(콜론+슬래시 2개). */
export const OPFS_URL_PREFIX = "opfs://";
/** OPFS 어댑터(state/db/opfs)의 참조 스킴(콜론 1개). */
export const OPFS_STORAGE_PREFIX = "opfs:";

/** `opfs://abc.png` → `opfs:abc.png` (어댑터 참조). */
export function toStorageRef(markdownUrl: string): string {
  return OPFS_STORAGE_PREFIX + markdownUrl.slice(OPFS_URL_PREFIX.length);
}

/** `opfs:abc.png` → `opfs://abc.png` (마크다운 URL). */
export function toMarkdownUrl(storageRef: string): string {
  return OPFS_URL_PREFIX + storageRef.slice(OPFS_STORAGE_PREFIX.length);
}
