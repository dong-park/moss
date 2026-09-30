import { describe, expect, it } from "vitest";
import {
  anchorPoint,
  bezierMidpoint,
  clientToWorld,
  connectorGeometry,
  connectorPath,
  isConnectableCard,
  nearestSide,
  CONNECTABLE_KINDS,
} from "@/components/workspace/connectors/geometry";

const rect = { x: 100, y: 200, width: 200, height: 100 };

describe("anchorPoint", () => {
  it("네 변 중앙을 월드 좌표로 돌려준다", () => {
    expect(anchorPoint(rect, "top")).toEqual({ x: 200, y: 200 });
    expect(anchorPoint(rect, "bottom")).toEqual({ x: 200, y: 300 });
    expect(anchorPoint(rect, "left")).toEqual({ x: 100, y: 250 });
    expect(anchorPoint(rect, "right")).toEqual({ x: 300, y: 250 });
  });

  it("height 미정의면 width로 정사각 취급", () => {
    expect(anchorPoint({ x: 0, y: 0, width: 80 }, "bottom")).toEqual({
      x: 40,
      y: 80,
    });
  });
});

describe("nearestSide", () => {
  it("점이 놓인 쪽 변을 고른다", () => {
    expect(nearestSide(rect, { x: 200, y: 100 })).toBe("top");
    expect(nearestSide(rect, { x: 200, y: 400 })).toBe("bottom");
    expect(nearestSide(rect, { x: 0, y: 250 })).toBe("left");
    expect(nearestSide(rect, { x: 400, y: 250 })).toBe("right");
  });

  it("카드 안쪽 점도 가장 가까운 변으로", () => {
    expect(nearestSide(rect, { x: 120, y: 250 })).toBe("left");
    expect(nearestSide(rect, { x: 200, y: 210 })).toBe("top");
  });
});

describe("connectorPath", () => {
  it("시작·끝 앵커와 법선 방향 제어점을 갖는 곡선", () => {
    const other = { x: 500, y: 550, width: 100, height: 100 };
    const path = connectorPath(rect, "right", other, "left");
    expect(path).toBe("M 300 250 C 460 250, 340 600, 500 600");
  });

  it("제어점 거리는 40~160으로 clamp", () => {
    const near = { x: 310, y: 200, width: 10, height: 10 };
    const path = connectorPath(rect, "right", near, "left");
    // 거리 46/2=23 → 40으로 clamp, 오른쪽/왼쪽 법선.
    expect(path).toBe("M 300 250 C 340 250, 270 205, 310 205");
  });
});

describe("connectorGeometry", () => {
  it("앵커·법선 제어점을 좌표로 직접 돌려준다", () => {
    const other = { x: 500, y: 550, width: 100, height: 100 };
    const g = connectorGeometry(rect, "right", other, "left");
    expect(g.p0).toEqual({ x: 300, y: 250 });
    expect(g.p1).toEqual({ x: 500, y: 600 });
    expect(g.c1).toEqual({ x: 460, y: 250 });
    expect(g.c2).toEqual({ x: 340, y: 600 });
  });
});

describe("bezierMidpoint", () => {
  it("베지어 t=0.5 지점을 좌표로 직접 계산한다", () => {
    const g = connectorGeometry(
      rect,
      "right",
      { x: 500, y: 550, width: 100, height: 100 },
      "left",
    );
    const m = bezierMidpoint(g.p0, g.c1, g.c2, g.p1);
    expect(m.x).toBeCloseTo(400, 5);
    expect(m.y).toBeCloseTo(425, 5);
  });
});

describe("clientToWorld", () => {
  it("viewport 변환을 역산한다", () => {
    const p = clientToWorld(300, 400, { left: 100, top: 50 }, { x: 20, y: 30, scale: 2 });
    expect(p).toEqual({ x: (300 - 100 - 20) / 2, y: (400 - 50 - 30) / 2 });
  });
});

describe("CONNECTABLE_KINDS", () => {
  it("메모(text)와 함(board)만 연결 대상", () => {
    expect(CONNECTABLE_KINDS).toEqual(["text", "board", "textbox"]);
    expect(isConnectableCard({ kind: "textbox" } as never)).toBe(true);
    expect(isConnectableCard({ kind: "text" } as never)).toBe(true);
    expect(isConnectableCard({ kind: "board" } as never)).toBe(true);
    expect(isConnectableCard({ kind: "frame" } as never)).toBe(false);
  });
});
