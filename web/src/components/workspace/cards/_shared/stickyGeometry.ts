import type { HandwritingPoint } from "@/state/cardContent";

/* ─────────────────────────────────────────────────────────────
 * wall-marker n5 — 포스트잇 위 획의 좌표 계산 (순수 함수).
 *
 * 포스트잇은 기울어 있고(D7=A) 줌에 따라 커진다. 획은 포스트잇 "자기 좌표"
 * (왼쪽 위 원점, 1:1 픽셀)로 저장해야 포스트잇을 옮겨도 따라가고 열어도 같은 자리다.
 * 그래서 화면 좌표에서 회전·줌을 풀어 자기 좌표로 바꾼다(D7=A). 포스트잇에서 시작한
 * 획은 포스트잇 가장자리에서 잘린다(D4=A) — 박스 밖은 저장하지 않는다.
 * ───────────────────────────────────────────────────────────── */

export interface CardBox {
  width: number;
  height: number;
}

const round1 = (v: number) => +v.toFixed(1);

/**
 * 화면 좌표 → 포스트잇 자기 좌표.
 *
 * @param center 포스트잇 상자의 화면 중심. 회전·확대가 중심 기준이라 회전된 상자의
 *               바깥 경계 사각형(getBoundingClientRect) 중심과 같다.
 * @param box    회전·확대 전 포스트잇 크기(레이아웃 크기).
 * @param scale  화면 px / 자기 좌표 단위 (줌).
 * @param deg    포스트잇 회전각(시계 방향이 +, CSS rotate와 같다).
 */
export function clientToCardLocal(
  client: { x: number; y: number },
  center: { x: number; y: number },
  box: CardBox,
  scale: number,
  deg: number,
): HandwritingPoint {
  const s = scale > 0 ? scale : 1;
  const dx = (client.x - center.x) / s;
  const dy = (client.y - center.y) / s;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // 화면에서 보이는 회전의 역: rotate(-deg).
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return { x: round1(lx + box.width / 2), y: round1(ly + box.height / 2) };
}

/**
 * 회전된 상자의 바깥 경계 사각형 크기와 레이아웃 크기에서 줌을 거꾸로 구한다.
 * 계산 불가(0 크기)이면 fallback.
 */
export function scaleFromBounds(
  boundsWidth: number,
  box: CardBox,
  deg: number,
  fallback: number,
): number {
  const rad = (deg * Math.PI) / 180;
  const denom = box.width * Math.abs(Math.cos(rad)) + box.height * Math.abs(Math.sin(rad));
  if (boundsWidth > 0 && denom > 0) return boundsWidth / denom;
  return fallback;
}

/** Liang–Barsky: 선분 a→b가 [0,w]×[0,h] 안에 드는 매개변수 구간. 안 닿으면 null. */
function clipSegment(
  a: HandwritingPoint,
  b: HandwritingPoint,
  w: number,
  h: number,
): { t0: number; t1: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, a.x], // x >= 0
    [dx, w - a.x], // x <= w
    [-dy, a.y], // y >= 0
    [dy, h - a.y], // y <= h
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null; // 평행하고 밖
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return { t0, t1 };
}

/**
 * 획을 포스트잇 박스로 자른다(D4=A). 박스 안 조각만 돌려준다 — 나갔다 다시 들어오면
 * 조각이 여럿이다. 점 하나(탭)는 같은 점 두 개로 취급해 안이면 점으로 남는다.
 */
export function clipStrokeToBox(
  points: readonly HandwritingPoint[],
  width: number,
  height: number,
): HandwritingPoint[][] {
  if (points.length === 0) return [];
  const src = points.length === 1 ? [points[0], points[0]] : points;
  const pieces: HandwritingPoint[][] = [];
  let run: HandwritingPoint[] = [];
  const flush = () => {
    if (run.length >= 2) pieces.push(run);
    run = [];
  };

  for (let i = 0; i + 1 < src.length; i++) {
    const a = src[i];
    const b = src[i + 1];
    const c = clipSegment(a, b, width, height);
    if (!c) {
      flush();
      continue;
    }
    const at = (t: number): HandwritingPoint => ({
      x: round1(a.x + (b.x - a.x) * t),
      y: round1(a.y + (b.y - a.y) * t),
    });
    if (c.t0 > 0) flush(); // 박스 밖에서 들어왔다 — 새 조각
    if (run.length === 0) run.push(at(c.t0));
    run.push(at(c.t1));
    if (c.t1 < 1) flush(); // 박스 밖으로 나갔다 — 조각 끝
  }
  flush();
  return pieces;
}
