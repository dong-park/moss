import { describe, test, expect } from "bun:test";
import { layoutMindmap } from "./mindmap.ts";

const at = (r: ReturnType<typeof layoutMindmap>, k: string) => r.nodes.find((n) => n.key === k)!;

describe("layoutMindmap", () => {
  test("갈래를 좌우로 나누고 선은 바깥 변 → 안쪽 변", () => {
    const r = layoutMindmap([
      { key: "c" },
      { key: "a", parent: "c" },
      { key: "b", parent: "c" },
    ]);
    expect(at(r, "a").side).toBe("right");
    expect(at(r, "b").side).toBe("left");
    expect(at(r, "a").x).toBeGreaterThan(at(r, "c").x + 320);
    expect(at(r, "b").x + 240).toBeLessThan(at(r, "c").x);
    expect(r.edges).toContainEqual({ from: "c", to: "a", sourceSide: "right", targetSide: "left" });
    expect(r.edges).toContainEqual({ from: "c", to: "b", sourceSide: "left", targetSide: "right" });
  });

  test("부모는 자식 묶음의 세로 가운데, 자식끼리 겹치지 않는다", () => {
    const r = layoutMindmap(
      [{ key: "c" }, { key: "p", parent: "c" }, { key: "x", parent: "p" }, { key: "y", parent: "p" }, { key: "z", parent: "p" }],
      { layout: "tree" },
    );
    const [x, y, z, p] = ["x", "y", "z", "p"].map((k) => at(r, k));
    expect(y!.y - x!.y).toBe(280);
    expect(z!.y - y!.y).toBe(280);
    expect(p!.y).toBe(y!.y);
    expect(x!.x).toBe(p!.x + 240 + 140);
  });

  test("잘못된 입력은 거부한다", () => {
    expect(() => layoutMindmap([{ key: "a" }, { key: "b" }])).toThrow("정확히 하나");
    expect(() => layoutMindmap([{ key: "a" }, { key: "b", parent: "nope" }])).toThrow("없는 parent");
    expect(() => layoutMindmap([{ key: "a" }, { key: "a", parent: "a" }])).toThrow("겹칩니다");
    expect(() =>
      layoutMindmap([{ key: "r" }, { key: "p", parent: "q" }, { key: "q", parent: "p" }]),
    ).toThrow("순환");
  });
});
