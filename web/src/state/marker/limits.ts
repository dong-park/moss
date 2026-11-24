/* ─────────────────────────────────────────────────────────────
 * wall-marker 리뷰 W1·W2 — 획 입력의 상한을 한 곳에 둔다.
 *
 * 원격 피어가 보내는 값은 믿지 않는다. 받는 쪽(문서 읽기·overlay 파싱)이 이 한계로 점을
 * 거르고, 쓰는 쪽(확정)도 같은 한계를 지켜 "쓴 것과 다시 읽은 것"이 어긋나지 않게 한다.
 * ───────────────────────────────────────────────────────────── */

/** 보드·카드 좌표의 절댓값 상한. 이 밖이거나 유한하지 않은 좌표는 버린다. */
export const BOARD_COORD_MAX = 1e6;

/** 좌표 하나가 쓸 수 있는 값인가 — 유한하고 ±BOARD_COORD_MAX 이내. */
export function isBoardCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= BOARD_COORD_MAX;
}

/** 한 획의 점 수 상한 — 원격 peer가 보낸 거대 값이 스토어·렌더를 막지 못하게 한다. */
export const MAX_STROKE_POINTS = 20_000;

/** 벽 획 `points` JSON 문자열 길이 상한(W2). JSON.parse 전에 건너뛴다. */
export const MAX_STROKE_POINTS_CHARS = 1_000_000;

/** 한 보드(벽)의 획 수 상한. 읽을 때 넘는 분은 무시하고, 새 획은 이 수를 넘기지 못한다. */
export const MAX_WALL_STROKES = 5_000;

/** 포스트잇 한 장의 획 수 상한. */
export const MAX_OVERLAY_STROKES = 2_000;

/** 포스트잇 overlay JSON 문자열 길이 상한 — 파싱 전에 건너뛴다. */
export const MAX_OVERLAY_CHARS = 8_000_000;

/**
 * 점이 `max`를 넘으면 앞에서 자르지 않고 고르게 솎아 `max`개 이하로 만든다 — 모양은 유지되고
 * 첫 점·끝 점은 반드시 남는다. 넘지 않으면 같은 배열을 그대로 돌려준다.
 */
export function thinToMax<T>(points: readonly T[], max: number = MAX_STROKE_POINTS): readonly T[] {
  const n = points.length;
  if (n <= max || max < 2) return n <= max ? points : points.slice(0, max);
  const out: T[] = [];
  const stride = (n - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * stride)]);
  return out;
}

/**
 * 확정하는 획의 점을 쓸 수 있는 모양으로 맞춘다 — 한계 밖 좌표는 버리고, 점이 상한을 넘으면
 * 솎는다. 쓰는 쪽이 이걸 거치면 읽는 쪽(같은 한계)이 같은 점을 돌려준다. 새 배열을 돌려준다.
 */
export function sanitizeStrokePoints(
  points: readonly { x: number; y: number }[],
): { x: number; y: number }[] {
  const ok: { x: number; y: number }[] = [];
  for (const p of points) if (isBoardCoord(p.x) && isBoardCoord(p.y)) ok.push({ x: p.x, y: p.y });
  return thinToMax(ok) as { x: number; y: number }[];
}

/** 좌표를 보드 좌표 한계 안으로 누른다(옮기기가 한계를 넘기지 않게). */
export function clampBoardCoord(value: number): number {
  return Math.max(-BOARD_COORD_MAX, Math.min(BOARD_COORD_MAX, value));
}
