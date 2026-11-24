import { describe, test, expect } from "bun:test";
import { layoutGroups } from "./groups.ts";

describe("layoutGroups", () => {
  test("메모는 판 안쪽 격자에, 같은 줄 판은 높이를 맞춘다", () => {
    const r = layoutGroups({
      hasCenter: true,
      groups: [
        { key: "a", notes: ["a1", "a2", "a3", "a4"] },
        { key: "b", notes: ["b1"] },
      ],
    });
    const a = r.frames.a!, b = r.frames.b!;
    expect(a.width).toBe(32 * 2 + 3 * 200 + 2 * 24);
    expect(a.height).toBe(b.height);
    expect(a.height).toBe(32 * 2 + 2 * 200 + 24);
    expect(r.center!.y + r.center!.height).toBeLessThan(a.y);
    for (const k of ["a1", "a2", "a3", "a4"]) {
      const n = r.notes[k]!;
      expect(n.x).toBeGreaterThanOrEqual(a.x);
      expect(n.x + n.width).toBeLessThanOrEqual(a.x + a.width);
      expect(n.y + n.height).toBeLessThanOrEqual(a.y + a.height);
    }
    expect(r.notes.a4!.y).toBe(r.notes.a1!.y + 224);
    expect(b.x).toBe(a.x + a.width + 120);
  });

  test("판이 groupCols를 넘으면 다음 줄로", () => {
    const r = layoutGroups({ hasCenter: false, groups: ["a", "b", "c", "d"].map((k) => ({ key: k, notes: [k + "1"] })) });
    expect(r.frames.d!.x).toBe(r.frames.a!.x);
    expect(r.frames.d!.y).toBeGreaterThan(r.frames.a!.y + r.frames.a!.height);
  });

  test("key가 겹치면 거부", () => {
    expect(() => layoutGroups({ hasCenter: false, groups: [{ key: "a", notes: ["a"] }] })).toThrow("겹칩니다");
  });

  test("jitter: 같은 입력이면 같은 흔들림, 범위 안, 판 밖으로 나가지 않는다", () => {
    const input = { hasCenter: false, groups: [{ key: "a", notes: ["a1", "a2", "a3", "a4", "a5"] }] };
    const opts = { jitter: { pos: 12, rot: 2, group: 30 } };
    const r1 = layoutGroups(input, opts), r2 = layoutGroups(input, opts);
    expect(r1).toEqual(r2);
    const plain = layoutGroups(input);
    const f = r1.frames.a!;
    for (const k of ["a1", "a2", "a3", "a4", "a5"]) {
      const n = r1.notes[k]!;
      expect(Math.abs(n.rotation!)).toBeLessThanOrEqual(2);
      expect(n.x).toBeGreaterThanOrEqual(f.x);
      expect(n.x + n.width).toBeLessThanOrEqual(f.x + f.width + 12);
    }
    expect(Object.values(r1.notes).some((n, i) => n.x !== Object.values(plain.notes)[i]!.x)).toBe(true);
    expect(plain.notes.a1!.rotation).toBeUndefined();
  });
});
