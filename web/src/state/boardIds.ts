/**
 * FEAT-onboarding-routes n1 — 보드 id 리터럴의 단일 출처(leaf 모듈).
 *
 * 시스템 보드도 예외 없는 UUID id를 가진 평범한 보드 행이다. 예전에는 "system"
 * 센티널과 `boardId === null` 매핑이 있었지만, 그 예외가 라우팅·문서 키·내보내기
 * 곳곳에 분기를 남겼다(D3). 이제 시스템 보드는 이 UUID 하나로 식별된다.
 *
 * 순환 import가 없는 leaf라 어느 모듈에서든 안전하게 import할 수 있다.
 *
 * n1 구현 메모: spec D3는 "첫 실행에 UUID를 발급"한다고 적었다. 여기서는 설치마다
 * 같은 값을 쓰는 고정 UUID를 쓴다 — 시스템 보드는 기기 로컬 전용이라 발급값이
 * 달라야 할 이유가 없고, 모듈 초기값과 마이그레이션이 어긋나 분기(placeholder vs
 * 발급값)가 남는 위험을 없앤다. server row id로 쓰이는 값은 발급값이어도 되므로
 * 이 선택은 되돌릴 수 있다(가정: 호출자 확인).
 */
export const SYSTEM_BOARD_ID = "00000000-0000-4000-8000-000000000001" as const;

/**
 * 레거시 `boardId === null` 표기를 시스템 보드 id로 정규화한다.
 *
 * n1 이전에 쓰인 Dexie 행·Yjs 문서·가져온 번들은 boardId가 null이다. 마이그레이션이
 * null을 새 id로 옮기지만, 중단·재개 경계와 옛 번들 가져오기를 위해 읽기 경계에서
 * 한 번 더 정규화한다. 새 쓰기는 null을 만들지 않는다.
 */
export function normalizeBoardId(id: string | null | undefined): string {
  return id ?? SYSTEM_BOARD_ID;
}

export function isSystemBoardId(id: string | null | undefined): boolean {
  return id === SYSTEM_BOARD_ID;
}
