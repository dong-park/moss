import { describe, expect, it } from "vitest";
import {
  BOARD_ROTATION_MAX_DEG,
  MEMO_ROTATION_MAX_DEG,
  MEMO_TINT_COUNT,
  MEMO_TINTS,
  CARD_LIFT_DEG,
  cardRotationDeg,
  formatDeg,
  memoBaseTransform,
  memoLiftedTransform,
  memoRotationDeg,
  memoTint,
} from "../memoVariety";

/**
 * FEAT-memo-variety AC-1·3·4·5 — 각도·색이 id 해시로 정해지는 규칙(순수 로직).
 * DOM 배선은 DraggableCard.memoVariety.test.tsx / MemoTint.test.tsx가 덮는다.
 */

/** 결정적 LCG — "무작위 id"를 실행마다 같게 만들어 분포 테스트를 안정시킨다. */
function randomIds(n: number): string[] {
  let s = 123456789;
  const next = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(`memo-${Math.floor(next() * 1e12)}-${i}`);
  return ids;
}

describe("FEAT-memo-variety · 각도", () => {
  it("AC-1: 모든 각도가 -1.5도 이상 1.5도 이하다", () => {
    for (const id of randomIds(1000)) {
      const deg = memoRotationDeg(id);
      expect(deg).toBeGreaterThanOrEqual(-MEMO_ROTATION_MAX_DEG);
      expect(deg).toBeLessThanOrEqual(MEMO_ROTATION_MAX_DEG);
    }
  });

  it("AC-1: 같은 id는 몇 번을 계산해도 같은 각도·색이다", () => {
    for (const id of ["c1", "abc", "메모-한글", "9f2a"]) {
      expect(memoRotationDeg(id)).toBe(memoRotationDeg(id));
      expect(memoTint(id)).toBe(memoTint(id));
    }
  });

  it("AC-3: 0.8도 메모를 들면 원래 각도에서 1.5도 덜 기운다", () => {
    // pick-84의 해시 각도는 0.799…도 — formatDeg로 0.8이 된다.
    const card = { id: "pick-84", kind: "text" };
    expect(memoBaseTransform(card, false)).toBe("rotate(0.8deg)");
    expect(memoLiftedTransform(card, false)).toBe("scale(1.03) rotate(-0.7deg)");
    // 손을 떼면(lift 해제) base transform으로 되돌아간다.
    expect(memoBaseTransform(card, false)).toBe("rotate(0.8deg)");
  });

  it("AC-4: 펜 모드에서는 각도가 0이다", () => {
    const card = { id: "pick-84", kind: "text" };
    expect(memoBaseTransform(card, true)).toBe("rotate(0deg)");
    expect(memoLiftedTransform(card, true)).toBe("scale(1.03) rotate(-1.5deg)");
  });

  it("AC-5: 비메모는 들지 않으면 무변화, 들면 기존과 같은 값이다", () => {
    const frame = { id: "f1", kind: "frame" };
    expect(memoBaseTransform(frame, false)).toBeUndefined();
    expect(memoLiftedTransform(frame, false)).toBe("scale(1.03) rotate(-1.5deg)");
  });

  it("파일함(board)은 메모보다 작은 상한(±1도) 안에서 기울고 펜 모드에서는 0이다", () => {
    for (const id of randomIds(1000)) {
      const deg = cardRotationDeg(id, "board");
      expect(deg).toBeGreaterThanOrEqual(-BOARD_ROTATION_MAX_DEG);
      expect(deg).toBeLessThanOrEqual(BOARD_ROTATION_MAX_DEG);
    }
    const b = { id: "b1", kind: "board" };
    expect(memoBaseTransform(b, false)).toBe(
      `rotate(${formatDeg(cardRotationDeg("b1", "board"))}deg)`,
    );
    expect(memoBaseTransform(b, true)).toBe("rotate(0deg)");
    expect(memoLiftedTransform(b, true)).toBe("scale(1.03) rotate(-1.5deg)");
    // 들면 고유 각도에서 CARD_LIFT_DEG만큼 더 기운다(메모와 같은 규칙).
    expect(memoLiftedTransform(b, false)).toBe(
      `scale(1.03) rotate(${formatDeg(cardRotationDeg("b1", "board") - CARD_LIFT_DEG)}deg)`,
    );
  });

  it("formatDeg: 소수 둘째 자리로 반올림하고 꼬리 0을 뗀다", () => {
    expect(formatDeg(0.7999999999999999)).toBe("0.8");
    expect(formatDeg(-0.7000000000000001)).toBe("-0.7");
    expect(formatDeg(1.5)).toBe("1.5");
    expect(formatDeg(-0)).toBe("0");
  });
});

describe("FEAT-memo-variety · 색조", () => {
  it("AC-1: 색은 팔레트 6색 중 하나다", () => {
    const palette = new Set<string>(MEMO_TINTS);
    for (const id of randomIds(500)) {
      expect(palette.has(memoTint(id))).toBe(true);
    }
  });

  it("AC-1: 무작위 1000개에서 6색이 모두 나오고 어느 색도 25%를 넘지 않는다", () => {
    const counts = new Map<string, number>();
    const ids = randomIds(1000);
    for (const id of ids) {
      const tint = memoTint(id);
      counts.set(tint, (counts.get(tint) ?? 0) + 1);
    }
    expect(counts.size).toBe(MEMO_TINT_COUNT);
    for (const n of counts.values()) {
      expect(n).toBeLessThanOrEqual(ids.length * 0.25);
    }
  });
});
