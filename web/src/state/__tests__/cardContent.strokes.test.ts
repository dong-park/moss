import { describe, expect, it } from "vitest";
import {
  coercePaths,
  coerceStrokes,
  parseHandwriting,
  parseStrokes,
  serializeStrokes,
  type HandwritingStroke,
} from "@/state/cardContent";

const pts = (...xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));

describe("wall-marker n1 — 포스트잇 획 형식 (색·굵기 이름)", () => {
  it("색·굵기가 없는 옛 overlay는 검정·가는 선으로 읽힌다 (T15)", () => {
    const legacy = JSON.stringify({ paths: [pts([0, 0], [10, 10]), pts([5, 5], [6, 6])] });
    const strokes = parseStrokes(legacy);
    expect(strokes).toHaveLength(2);
    for (const s of strokes) {
      expect(s.color).toBe("black");
      expect(s.width).toBe("thin");
    }
    expect(strokes[0].points).toEqual(pts([0, 0], [10, 10]));
  });

  it("새 형식은 획마다 색·굵기를 싣고 왕복한다", () => {
    const strokes: HandwritingStroke[] = [
      { points: pts([0, 0], [1, 1]), color: "red", width: "thick" },
      { points: pts([2, 2], [3, 3]), color: "black", width: "thin" },
      { points: pts([4, 4], [5, 5]), color: "green", width: "mid" },
    ];
    const json = serializeStrokes(strokes);
    expect(parseStrokes(json)).toEqual(strokes);
  });

  it("검정·가는 선만 있는 overlay는 옛 형식과 바이트가 같다(읽고 다시 써도 안 변한다)", () => {
    const legacy = JSON.stringify({ paths: [pts([0, 0], [10, 10])] });
    expect(serializeStrokes(parseStrokes(legacy))).toBe(legacy);
  });

  it("옛 형식과 새 형식이 한 overlay에 섞여 있어도 읽힌다", () => {
    const mixed = JSON.stringify({
      paths: [pts([0, 0], [1, 1]), { points: pts([2, 2], [3, 3]), color: "blue", width: "mid" }],
    });
    const strokes = parseStrokes(mixed);
    expect(strokes.map((s) => [s.color, s.width])).toEqual([
      ["black", "thin"],
      ["blue", "mid"],
    ]);
  });

  it("모르는 색·굵기 이름이나 깨진 점은 획을 버리지 않고 기본값·점 제거로 읽는다", () => {
    const raw = [
      { points: pts([0, 0], [1, 1]), color: "neon", width: 99 },
      { points: [{ x: "a", y: 1 }, { x: 2, y: 3 }], color: "red" },
      { points: [] },
      "garbage",
    ];
    const strokes = coerceStrokes(raw);
    expect(strokes).toHaveLength(2);
    expect(strokes[0].color).toBe("black");
    expect(strokes[0].width).toBe("thin");
    expect(strokes[1].points).toEqual([{ x: 2, y: 3 }]);
    expect(strokes[1].color).toBe("red");
  });

  it("점만 읽는 옛 호출부는 새 형식 overlay에서도 점을 잃지 않는다", () => {
    const json = serializeStrokes([{ points: pts([0, 0], [9, 9]), color: "red", width: "thick" }]);
    expect(parseHandwriting(json).paths).toEqual([pts([0, 0], [9, 9])]);
    expect(coercePaths([{ points: pts([1, 1]) }])).toEqual([pts([1, 1])]);
  });
});
