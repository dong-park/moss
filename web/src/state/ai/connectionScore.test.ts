import { describe, test, expect } from "vitest";
import {
  cosineSimilarity,
  temporalDecay,
  userSignal,
  computeConnectionCandidates,
  type ScoredNote,
} from "./connectionScore";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function note(
  id: string,
  vector: number[],
  overrides: Partial<ScoredNote> = {},
): ScoredNote {
  return {
    id,
    boardId: null,
    createdAt: NOW,
    vector,
    ...overrides,
  };
}

describe("cosineSimilarity", () => {
  test("동일 벡터 → 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });
  test("직교 벡터 → 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  test("정반대 벡터 → -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });
  test("길이 다르면 0", () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
  test("영벡터 → 0", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("temporalDecay", () => {
  test("같은 시각 → 1", () => {
    expect(temporalDecay(NOW, NOW)).toBeCloseTo(1, 6);
  });
  test("30일 차이 → 약 0.5 + 0.5/e ≈ 0.684", () => {
    expect(temporalDecay(NOW, NOW + 30 * DAY)).toBeCloseTo(
      0.5 + 0.5 / Math.E,
      4,
    );
  });
  test("100일 차이 → 0.5 근접 (≥ 0.5)", () => {
    expect(temporalDecay(NOW, NOW + 100 * DAY)).toBeGreaterThanOrEqual(0.5);
    expect(temporalDecay(NOW, NOW + 100 * DAY)).toBeLessThan(0.55);
  });
});

describe("userSignal", () => {
  test("기본 1.0", () => {
    const a = note("a", [1]);
    const b = note("b", [1]);
    expect(userSignal(a, b, [])).toBe(1);
  });
  test("같은 보드 → 0.85 감점", () => {
    const a = note("a", [1], { boardId: "B" });
    const b = note("b", [1], { boardId: "B" });
    expect(userSignal(a, b, [])).toBeCloseTo(0.85, 6);
  });
  test("거절 이력 있으면 0.85 감점", () => {
    const a = note("a", [1]);
    const b = note("b", [1]);
    expect(
      userSignal(a, b, [{ a: "a", b: "b", rejectedAt: NOW - DAY * 30 }]),
    ).toBeCloseTo(0.85, 6);
  });
  test("같은 보드 + 거절 → 누적 감점 (0.85 × 0.85)", () => {
    const a = note("a", [1], { boardId: "B" });
    const b = note("b", [1], { boardId: "B" });
    expect(
      userSignal(a, b, [{ a: "a", b: "b", rejectedAt: NOW - DAY * 30 }]),
    ).toBeCloseTo(0.7225, 6);
  });
});

describe("computeConnectionCandidates", () => {
  test("임계 미만 쌍은 제외 (cosine 0.5)", () => {
    const a = note("a", [1, 0]);
    const b = note("b", [0.5, 0.866]); // cosine ~= 0.5
    const c = computeConnectionCandidates([a, b], { now: NOW });
    expect(c).toEqual([]);
  });

  test("임계 이상 쌍은 포함, score 내림차순", () => {
    const a = note("a", [1, 0]);
    const b = note("b", [0.99, 0.14]); // cosine ~= 0.99
    const cN = note("c", [0.9, 0.43]); // cosine ~= 0.9
    const result = computeConnectionCandidates([a, b, cN], { now: NOW });
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  test("24h 이내 거절된 쌍은 후보에서 제거", () => {
    const a = note("a", [1, 0]);
    const b = note("b", [1, 0]);
    const result = computeConnectionCandidates([a, b], {
      now: NOW,
      rejectedPairs: [{ a: "a", b: "b", rejectedAt: NOW - DAY / 2 }],
    });
    expect(result).toEqual([]);
  });

  test("24h 지난 거절은 후보 포함되나 점수 감점 적용", () => {
    const a = note("a", [1, 0]);
    const b = note("b", [1, 0]);
    const result = computeConnectionCandidates([a, b], {
      now: NOW,
      rejectedPairs: [{ a: "a", b: "b", rejectedAt: NOW - DAY * 3 }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].components.userSignal).toBeCloseTo(0.85, 6);
  });

  test("쌍 키 정규화: rejected (a,b) vs (b,a) 동일 취급", () => {
    const a = note("a", [1, 0]);
    const b = note("b", [1, 0]);
    const result = computeConnectionCandidates([a, b], {
      now: NOW,
      rejectedPairs: [{ a: "b", b: "a", rejectedAt: NOW - DAY / 4 }],
    });
    expect(result).toEqual([]);
  });

  test("같은 클러스터 쌍은 상위 1개만 통과", () => {
    const a = note("a", [1, 0], { clusterId: "C1" });
    const b = note("b", [0.99, 0.14], { clusterId: "C1" });
    const cN = note("c", [0.97, 0.24], { clusterId: "C1" });
    const result = computeConnectionCandidates([a, b, cN], { now: NOW });
    expect(result).toHaveLength(1);
  });

  test("다른 클러스터 쌍은 모두 통과", () => {
    const a = note("a", [1, 0], { clusterId: "C1" });
    const b = note("b", [0.99, 0.14], { clusterId: "C2" });
    const cN = note("c", [0.97, 0.24], { clusterId: "C3" });
    const result = computeConnectionCandidates([a, b, cN], { now: NOW });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test("threshold 옵션 커스터마이즈", () => {
    const a = note("a", [1, 0]);
    const b = note("b", [0.9, 0.43]); // cosine ~= 0.9
    const high = computeConnectionCandidates([a, b], {
      now: NOW,
      threshold: 0.95,
    });
    expect(high).toEqual([]);
    const low = computeConnectionCandidates([a, b], {
      now: NOW,
      threshold: 0.7,
    });
    expect(low).toHaveLength(1);
  });
});
