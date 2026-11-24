/**
 * OPFS 참조 스킴 변환 — 순수 함수(에디터·Milkdown 의존 없음).
 *
 * 어댑터(state/db/opfs)는 `opfs:<file>`(콜론 1개), 마크다운 본문은
 * `opfs://<file>`(콜론+슬래시 2개)을 쓴다. imagePaste.ts(에디터)와
 * state/blocks.ts(순수 모듈)가 함께 쓴다.
 * 정의는 sync MCP와 같이 쓰도록 @moss/doc-model에 있다.
 */
import { LOCAL_REF_PREFIX, OPFS_URL_PREFIX, toLocalRef, toMarkdownUrl } from "@moss/doc-model";

/** 마크다운 본문에 들어가는 URL 스킴(콜론+슬래시 2개). */
export { OPFS_URL_PREFIX };
/** OPFS 어댑터(state/db/opfs)의 참조 스킴(콜론 1개). */
export const OPFS_STORAGE_PREFIX = LOCAL_REF_PREFIX;

/** `opfs://abc.png` → `opfs:abc.png` (어댑터 참조). */
export const toStorageRef = toLocalRef;

/** `opfs:abc.png` → `opfs://abc.png` (마크다운 URL). */
export { toMarkdownUrl };
