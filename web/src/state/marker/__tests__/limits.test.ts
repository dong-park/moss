/**
 * wall-marker 리뷰 W1 — 좌표 한계. 원격 피어가 넣은 Infinity(`1e999`)·±1e300 좌표가 천 지우개를
 * 끝나지 않는 루프로 끌고 가지 못하게 한다. 받는 쪽(coercePoints·parseStrokePoints)이 점을
 * 버리고, 엔진(densify)도 비유한 좌표·과대 표본을 스스로 막는다.
 */
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { parseStrokes } from "@/state/cardContent";
import { BOARD_COORD_MAX, isBoardCoord } from "@/state/marker/limits";
import { strokesMap, yMapToStroke } from "@/state/ydoc/model";
import { eraseArea, type DrawingStroke } from "@/components/workspace/cards/_shared/useDrawing";

const line = (id: string, pts: Array<[number, number]>): DrawingStroke => ({
  id,
  points: pts.map(([x, y]) => ({ x, y })),
  color: "black",
  width: "thin",
});

function everyFinite(strokes: DrawingStroke[]): boolean {
  return strokes.every((s) => s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
}

describe("isBoardCoord", () => {
  it("유한하고 ±BOARD_COORD_MAX 이내인 수만 통과한다", () => {
    expect(isBoardCoord(0)).toBe(true);
    expect(isBoardCoord(-BOARD_COORD_MAX)).toBe(true);
    expect(isBoardCoord(BOARD_COORD_MAX)).toBe(true);
    expect(isBoardCoord(BOARD_COORD_MAX + 1)).toBe(false);
    expect(isBoardCoord(Infinity)).toBe(false);
    expect(isBoardCoord(NaN)).toBe(false);
    expect(isBoardCoord("1")).toBe(false);
  });
});

describe("받는 쪽 — 한계 밖 점은 버린다", () => {
  it("포스트잇 overlay: JSON 1e999(Infinity)·±1e300·한계 밖 점이 버려지고 나머지는 남는다", () => {
    const json =
      '{"paths":[[{"x":1,"y":2},{"x":1e999,"y":0},{"x":-1e300,"y":0},{"x":2000000,"y":0},{"x":3,"y":4}]]}';
    const strokes = parseStrokes(json);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it("포스트잇 overlay: 모든 점이 한계 밖이면 그 획은 사라진다", () => {
    expect(parseStrokes('{"paths":[[{"x":1e999,"y":0},{"x":0,"y":1e300}]]}')).toEqual([]);
  });

  it("벽 획: 문서의 points에 든 한계 밖 점이 버려진다", () => {
    const doc = new Y.Doc();
    const m = new Y.Map<unknown>();
    strokesMap(doc).set("s", m);
    m.set("id", "s");
    m.set("boardId", "b");
    m.set("points", '[{"x":0,"y":0},{"x":1e999,"y":0},{"x":1e300,"y":1},{"x":9,"y":9}]');
    m.set("createdAt", 1);
    expect(yMapToStroke(m)?.points).toEqual([
      { x: 0, y: 0 },
      { x: 9, y: 9 },
    ]);
  });
});

describe("eraseArea — 비유한·과대 좌표에도 끝난다", () => {
  it("Infinity 좌표가 든 획을 문질러도 탭이 멎지 않고, 결과에 비유한 점이 없다", () => {
    const evil = line("evil", [
      [0, 0],
      [Infinity, 0],
      [10, 0],
    ]);
    const t0 = performance.now();
    const r = eraseArea([evil], [{ x: 5, y: 0 }], 8, () => "n");
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(everyFinite(r.added)).toBe(true);
  });

  it("±1e300 좌표 획을 문질러도 끝나고 결과가 유한하다", () => {
    const evil = line("evil", [
      [-1e300, 0],
      [1e300, 0],
    ]);
    const t0 = performance.now();
    const r = eraseArea([evil], [{ x: 0, y: 0 }], 8, () => "n");
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(everyFinite(r.added)).toBe(true);
  });

  it("정상 획의 가운데를 문지르는 동작은 그대로다(표본 상한이 정상 길이에 영향 없다)", () => {
    let n = 0;
    const r = eraseArea([line("a", [[0, 0], [400, 0]])], [{ x: 200, y: 0 }], 8, () => `p${++n}`);
    expect(r.removedIds).toEqual(["a"]);
    expect(r.added).toHaveLength(2);
  });
});
