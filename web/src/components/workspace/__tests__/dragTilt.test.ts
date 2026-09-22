import { describe, expect, it } from "vitest";
import { MAX_TILT_DEG, nextTiltAngle } from "@/components/workspace/dragTilt";

/**
 * FEAT-drag-tilt T1: 속도 스무딩·각도 계산 순수 함수.
 * 부호, 상한, 정지 수렴, 들쭉날쭉한 dt에서의 부호 안정성을 단위로 확인한다.
 */
describe("nextTiltAngle", () => {
  it("오른쪽 이동(dx>0)은 시계 반대(음수), 왼쪽은 반대 부호다", () => {
    const right = nextTiltAngle(0, 10, 16);
    const left = nextTiltAngle(0, -10, 16);
    expect(right).toBeLessThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it("각도 절댓값은 MAX_TILT_DEG를 넘지 않는다", () => {
    let a = 0;
    for (let i = 0; i < 50; i++) a = nextTiltAngle(a, 1000, 16);
    expect(Math.abs(a)).toBeLessThanOrEqual(MAX_TILT_DEG);
    let b = 0;
    for (let i = 0; i < 50; i++) b = nextTiltAngle(b, -1000, 16);
    expect(Math.abs(b)).toBeLessThanOrEqual(MAX_TILT_DEG);
  });

  it("정지(dx=0)를 반복하면 0으로 수렴한다", () => {
    let a = nextTiltAngle(0, 20, 16);
    expect(Math.abs(a)).toBeGreaterThan(0.1);
    for (let i = 0; i < 60; i++) a = nextTiltAngle(a, 0, 16);
    expect(Math.abs(a)).toBeLessThan(0.1);
  });

  it("dt가 들쭉날쭉해도 같은 방향 이동이면 부호가 뒤집히지 않는다", () => {
    const dts = [16, 5, 33, 1, 50, 8, 24];
    let a = 0;
    for (const dt of dts) {
      a = nextTiltAngle(a, 4, dt);
      expect(a).toBeLessThan(0);
    }
    // 반대 방향도 대칭으로.
    let b = 0;
    for (const dt of dts) {
      b = nextTiltAngle(b, -4, dt);
      expect(b).toBeGreaterThan(0);
    }
  });

  it("dt=0·NaN 같은 비정상 입력에도 폭주하지 않는다", () => {
    expect(Number.isFinite(nextTiltAngle(0, 10, 0))).toBe(true);
    expect(Number.isFinite(nextTiltAngle(0, 10, NaN))).toBe(true);
    expect(Math.abs(nextTiltAngle(0, 10, 0))).toBeLessThanOrEqual(MAX_TILT_DEG);
  });
});
