import { describe, expect, it } from "vitest";
import {
  strokeBounds,
  strokeTouchesRect,
  unionBounds,
  wallStrokesTouching,
} from "../wallStrokeHit";
import type { WallStroke } from "@/state/db/schema";

// wall-marker n6 — 고르기 상자의 "닿았나" 판정. 경계 상자로 거른 뒤 점·선분으로 확인한다.

const box = { left: 100, top: 100, right: 200, bottom: 200 };

function stroke(
  id: string,
  pts: Array<[number, number]>,
  width: WallStroke["width"] = "thin",
): WallStroke {
  return {
    id,
    boardId: "b",
    points: pts.map(([x, y]) => ({ x, y })),
    color: "black",
    width,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("strokeTouchesRect", () => {
  it("점이 상자 안에 있으면 닿았다", () => {
    expect(strokeTouchesRect(stroke("a", [[150, 150], [300, 300]]), box)).toBe(true);
  });

  it("점은 전부 밖이어도 선분이 상자를 가로지르면 닿았다", () => {
    // 왼쪽 밖 → 오른쪽 밖, 상자 가운데를 지난다.
    expect(strokeTouchesRect(stroke("a", [[50, 150], [250, 150]]), box)).toBe(true);
    // 대각선으로 모서리 부분만 스친다.
    expect(strokeTouchesRect(stroke("a", [[90, 120], [120, 90]]), box)).toBe(true);
  });

  it("상자 밖을 지나는 선분은 닿지 않았다 (경계 상자는 겹쳐도)", () => {
    // 경계 상자는 상자와 겹치지만 선분은 왼쪽 위 모서리를 비켜 간다.
    expect(strokeTouchesRect(stroke("a", [[50, 140], [140, 50]]), box)).toBe(false);
    expect(strokeTouchesRect(stroke("a", [[10, 10], [60, 80]]), box)).toBe(false);
  });

  it("굵은 획은 가장자리에 스치기만 해도 닿는다 (굵기 절반이 획이다)", () => {
    // thick = 8 → 반쪽 4. 상자 왼쪽 변(100)에서 3 떨어진 세로선.
    const near = [[97, 120], [97, 180]] as Array<[number, number]>;
    expect(strokeTouchesRect(stroke("a", near, "thick"), box)).toBe(true);
    expect(strokeTouchesRect(stroke("a", near, "thin"), box)).toBe(false);
  });

  it("점 하나짜리 획(탭)은 그 점이 상자 안이면 닿았다", () => {
    expect(strokeTouchesRect(stroke("a", [[150, 150]]), box)).toBe(true);
    expect(strokeTouchesRect(stroke("a", [[400, 400]]), box)).toBe(false);
  });

  it("점이 없는 획은 어디에도 닿지 않는다", () => {
    expect(strokeBounds(stroke("a", []))).toBeNull();
    expect(strokeTouchesRect(stroke("a", []), box)).toBe(false);
  });
});

describe("wallStrokesTouching / unionBounds", () => {
  const title = stroke("title", [[120, 120], [180, 120]]);
  const underline = stroke("under", [[110, 190], [190, 190]]);
  const far = stroke("far", [[500, 500], [560, 520]]);

  it("닿은 획만, 그은 순서대로 돌려준다", () => {
    expect(wallStrokesTouching([title, far, underline], box)).toEqual(["title", "under"]);
    expect(wallStrokesTouching([far], box)).toEqual([]);
  });

  it("묶음 테두리는 닿은 획 전체를 감싼다", () => {
    const u = unionBounds([title, underline])!;
    // thin = 2 → 반쪽 1.
    expect(u).toEqual({ left: 109, top: 119, right: 191, bottom: 191 });
    expect(unionBounds([])).toBeNull();
  });
});
