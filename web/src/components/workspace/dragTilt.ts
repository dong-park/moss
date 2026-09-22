/**
 * FEAT-drag-tilt: 단일 메모를 끌 때 종이처럼 흔들리기 위한 각도 계산.
 *
 * 드래그 중 각도는 DOM에 직접 쓰고(`DraggableCard`), 스토어에는 쓰지 않는다.
 * 트랙패드 mousemove 간격(dt)이 고르지 않으므로 지수 이동평균으로 떨림을 누른다.
 * 이동 방향의 반대쪽으로 처진다 — 오른쪽(dx>0)으로 끌면 시계 반대(음수)다.
 */

/** 기울기 절댓값 상한(도). */
export const MAX_TILT_DEG = 8;

/** 가로 속도(px/ms) → 각도(deg) 비례 계수. 손으로 만져 맞춘다. */
const TILT_GAIN = 14;

/** 각도 지수 이동평균 시정수(ms). 작을수록 민첩, 클수록 둔하다. */
const TILT_TAU_MS = 90;

/** dt를 못 믿을 때(0·NaN) 쓰는 기본 프레임 간격(ms). */
const FALLBACK_DT_MS = 16;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 다음 기울기 각도(도).
 *
 * - `prevDeg`: 직전 각도
 * - `dxPx`: 직전 계산 이후 가로 이동량(px, 오른쪽 양수)
 * - `dtMs`: 직전 계산 이후 경과 시간(ms)
 *
 * 정지(dx=0)를 반복 입력하면 0으로 수렴하고, dt가 들쭉날쭉해도
 * EMA가 순간 속도 스파이크를 눌러 부호가 요동치지 않는다.
 */
export function nextTiltAngle(
  prevDeg: number,
  dxPx: number,
  dtMs: number,
): number {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : FALLBACK_DT_MS;
  const velocity = (Number.isFinite(dxPx) ? dxPx : 0) / dt; // px/ms
  const target = clamp(-velocity * TILT_GAIN, -MAX_TILT_DEG, MAX_TILT_DEG);
  const alpha = 1 - Math.exp(-dt / TILT_TAU_MS);
  return clamp(prevDeg + (target - prevDeg) * alpha, -MAX_TILT_DEG, MAX_TILT_DEG);
}
