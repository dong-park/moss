import { describe, expect, it } from "vitest";
import {
  clientToCardLocal,
  clipStrokeToBox,
  scaleFromBounds,
} from "../stickyGeometry";

/**
 * wall-marker n5 — 포스트잇 자기 좌표 변환(D7=A)과 가장자리 자르기(D4=A).
 */

const box = { width: 300, height: 300 };
const center = { x: 500, y: 400 };

describe("clientToCardLocal · 회전·줌 풀기", () => {
  it("기울지 않은 포스트잇은 중심 기준 오프셋이 그대로 자기 좌표가 된다", () => {
    const p = clientToCardLocal({ x: 500, y: 400 }, center, box, 1, 0);
    expect(p).toEqual({ x: 150, y: 150 });
    expect(clientToCardLocal({ x: 400, y: 380 }, center, box, 1, 0)).toEqual({ x: 50, y: 130 });
  });

  it("5도 기운 포스트잇에서 화면 수평선은 자기 좌표에서 기운 선이 된다", () => {
    const a = clientToCardLocal({ x: 400, y: 400 }, center, box, 1, 5);
    const b = clientToCardLocal({ x: 600, y: 400 }, center, box, 1, 5);
    // 화면에서 수평이던 두 점은 포스트잇 기준으로는 y가 다르다(왼쪽이 아래, 오른쪽이 위).
    expect(a.y).toBeGreaterThan(b.y);
    expect(a.y - b.y).toBeCloseTo(200 * Math.sin((5 * Math.PI) / 180), 0);
    // 길이는 변하지 않는다.
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(200, 0);
  });

  it("회전을 다시 걸면 처음 화면 좌표로 돌아온다 (역변환)", () => {
    const deg = 5;
    const client = { x: 560, y: 340 };
    const local = clientToCardLocal(client, center, box, 1, deg);
    const lx = local.x - box.width / 2;
    const ly = local.y - box.height / 2;
    const rad = (deg * Math.PI) / 180;
    const back = {
      x: center.x + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: center.y + lx * Math.sin(rad) + ly * Math.cos(rad),
    };
    expect(back.x).toBeCloseTo(client.x, 0);
    expect(back.y).toBeCloseTo(client.y, 0);
  });

  it("줌 2배면 화면 100px이 자기 좌표 50이다", () => {
    const p = clientToCardLocal({ x: 600, y: 400 }, center, box, 2, 0);
    expect(p).toEqual({ x: 200, y: 150 });
  });
});

describe("scaleFromBounds", () => {
  it("회전된 상자의 바깥 경계 폭에서 줌을 구한다", () => {
    const deg = 5;
    const rad = (deg * Math.PI) / 180;
    const unit = 300 * (Math.cos(rad) + Math.sin(rad));
    expect(scaleFromBounds(unit * 1.5, box, deg, 1)).toBeCloseTo(1.5, 5);
  });

  it("바깥 경계가 0이면 fallback", () => {
    expect(scaleFromBounds(0, box, 0, 0.75)).toBe(0.75);
  });
});

describe("clipStrokeToBox · 포스트잇 가장자리에서 자르기", () => {
  it("안에 있는 획은 그대로 한 조각이다", () => {
    const pieces = clipStrokeToBox(
      [
        { x: 10, y: 10 },
        { x: 100, y: 50 },
      ],
      300,
      300,
    );
    expect(pieces).toEqual([
      [
        { x: 10, y: 10 },
        { x: 100, y: 50 },
      ],
    ]);
  });

  it("오른쪽 가장자리를 넘으면 가장자리 점에서 끝난다", () => {
    const [piece] = clipStrokeToBox(
      [
        { x: 250, y: 100 },
        { x: 350, y: 100 },
      ],
      300,
      300,
    );
    expect(piece[piece.length - 1]).toEqual({ x: 300, y: 100 });
    expect(piece.every((p) => p.x >= 0 && p.x <= 300)).toBe(true);
  });

  it("나갔다 다시 들어오면 조각이 둘이다", () => {
    const pieces = clipStrokeToBox(
      [
        { x: 100, y: 100 },
        { x: 100, y: -50 },
        { x: 200, y: -50 },
        { x: 200, y: 100 },
      ],
      300,
      300,
    );
    expect(pieces).toHaveLength(2);
    expect(pieces[0][0]).toEqual({ x: 100, y: 100 });
    expect(pieces[0][pieces[0].length - 1]).toEqual({ x: 100, y: 0 });
    expect(pieces[1][0]).toEqual({ x: 200, y: 0 });
  });

  it("전부 밖이면 아무것도 남지 않는다", () => {
    expect(
      clipStrokeToBox(
        [
          { x: 400, y: 10 },
          { x: 500, y: 10 },
        ],
        300,
        300,
      ),
    ).toEqual([]);
  });

  it("탭(점 하나)은 안이면 점으로 남는다", () => {
    expect(clipStrokeToBox([{ x: 50, y: 60 }], 300, 300)).toEqual([
      [
        { x: 50, y: 60 },
        { x: 50, y: 60 },
      ],
    ]);
    expect(clipStrokeToBox([{ x: 350, y: 60 }], 300, 300)).toEqual([]);
  });
});
