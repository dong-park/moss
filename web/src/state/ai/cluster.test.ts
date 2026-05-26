import { describe, test, expect } from "vitest";
import { clusterNotes } from "./cluster";

describe("clusterNotes", () => {
  test("동일 벡터 3개 → 1 클러스터", () => {
    const r = clusterNotes([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [1, 0] },
      { id: "c", vector: [1, 0] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].members.sort()).toEqual(["a", "b", "c"]);
    expect(r[0].size).toBe(3);
  });

  test("직교 벡터 3개 → 3 클러스터", () => {
    const r = clusterNotes([
      { id: "a", vector: [1, 0, 0] },
      { id: "b", vector: [0, 1, 0] },
      { id: "c", vector: [0, 0, 1] },
    ]);
    expect(r).toHaveLength(3);
    expect(r.map((c) => c.size)).toEqual([1, 1, 1]);
  });

  test("임계 이상 메모는 가장 가까운 클러스터로 합쳐짐", () => {
    const r = clusterNotes([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0.99, 0.14] }, // cosine ~= 0.99 → a 옆
      { id: "c", vector: [0, 1] }, // 별도
    ]);
    expect(r).toHaveLength(2);
    const ab = r.find((c) => c.members.includes("a"))!;
    expect(ab.members.sort()).toEqual(["a", "b"]);
  });

  test("threshold 옵션 변경", () => {
    const notes = [
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0.9, 0.43] }, // cosine ~= 0.9
    ];
    expect(clusterNotes(notes, { threshold: 0.95 })).toHaveLength(2);
    expect(clusterNotes(notes, { threshold: 0.7 })).toHaveLength(1);
  });

  test("빈 입력 → 빈 배열", () => {
    expect(clusterNotes([])).toEqual([]);
  });

  test("길이 0 벡터는 무시", () => {
    const r = clusterNotes([
      { id: "skip", vector: [] },
      { id: "a", vector: [1, 0] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].members).toEqual(["a"]);
  });

  test("centroid는 부분 평균(running mean) — 점진적 drift", () => {
    const r = clusterNotes([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0.96, 0.28] }, // 합류 (cosine ~= 0.96)
    ]);
    expect(r).toHaveLength(1);
    // centroid는 두 벡터의 산술 평균
    expect(r[0].centroid[0]).toBeCloseTo((1 + 0.96) / 2, 6);
    expect(r[0].centroid[1]).toBeCloseTo((0 + 0.28) / 2, 6);
  });
});
