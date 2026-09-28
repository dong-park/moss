/**
 * FEAT-collab-auth n23 — 보드 id 리터럴의 단일 출처(leaf 모듈).
 *
 * 여기서만 "시스템 보드" 센티널을 정의한다. workspace는 이 값을 재노출하고,
 * ydoc/activeDoc은 문서 키(`moss-board-<key>`)를 이 값에서 파생한다. 순환 import가
 * 없는 leaf라 어느 모듈에서든 안전하게 import할 수 있다.
 */
export const SYSTEM_BOARD_ID = "system" as const;
