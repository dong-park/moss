import { useWorkspace } from "@/state/workspace";

/**
 * FEAT-glass-first-wall n3: 빈 벽 판정.
 *
 * 벽에 포스트잇(카드)도 마카 획도 없으면 비어 있다 — 힌트 한 줄이 뜨는 유일한 조건.
 * "봤음" 표시를 저장하지 않으므로 기기를 옮겨도, 다 지우고 나서도 같은 규칙이다.
 */
export function isWallEmpty(
  cards: readonly unknown[],
  wallStrokeCount: number,
): boolean {
  return cards.length === 0 && wallStrokeCount === 0;
}

/**
 * 지금 벽의 마카 획 개수 — 벽 획 저장소(`wallStrokes`)의 길이다.
 * 마카로만 쓴 벽에도 빈 벽 힌트가 뜨지 않게 한다. 포스트잇 위 획은 포스트잇이 이미 센다.
 */
export function useWallStrokeCount(): number {
  return useWorkspace((s) => s.wallStrokes.length);
}
