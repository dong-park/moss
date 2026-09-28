/**
 * FEAT-collab-auth n7 — 참여자 색 8개 (spec §4, §14).
 *
 * 시스템 색 8개를 접속 순서 index mod 8로 돌려 쓴다. 시안 v3
 * (`moss-collab/mock.html`)의 아바타·커서·선택 테두리 색과 맞춘다.
 */
export const SYSTEM_COLORS = [
  "#5e5ce6",
  "#ff9f0a",
  "#30d158",
  "#ff375f",
  "#ffd60a",
  "#0a84ff",
  "#bf5af2",
  "#64d2ff",
] as const;

export const COLLAB_COLOR_COUNT = SYSTEM_COLORS.length;

/** index를 0..7로 정규화해 시스템 색을 돌려준다. 음수도 안전. */
export function colorForIndex(index: number): string {
  const normalized =
    ((Math.trunc(index) % COLLAB_COLOR_COUNT) + COLLAB_COLOR_COUNT) %
    COLLAB_COLOR_COUNT;
  return SYSTEM_COLORS[normalized];
}

/**
 * 접속 순서(clientIds 배열 순서)대로 색을 배정한다.
 * 같은 clientId가 두 번 오면 첫 순서의 색을 유지한다.
 */
export function assignColorsByJoinOrder(
  clientIds: readonly number[],
): Map<number, string> {
  const assigned = new Map<number, string>();
  let order = 0;
  for (const clientId of clientIds) {
    if (assigned.has(clientId)) continue;
    assigned.set(clientId, colorForIndex(order));
    order += 1;
  }
  return assigned;
}
