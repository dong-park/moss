import type { WallStroke } from "@/state/db/schema";
import { markerWidthUnits } from "@/state/marker/tokens";

/* ─────────────────────────────────────────────────────────────
 * wall-marker n6 — 고르기 상자가 벽 획에 "닿았나"의 판정.
 *
 * 규칙: 상자에 조금이라도 닿은 획이 잡힌다(spec 경계 조건 「고르기」). 보이는 획 두께까지가
 * 획이므로 판정 여백은 굵기의 절반이다. 순서는 경계 상자로 싸게 거른 뒤 점·선분으로 확인한다.
 * 전부 보드 좌표다.
 * ───────────────────────────────────────────────────────────── */

export interface BoardRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Pt {
  x: number;
  y: number;
}

function inside(p: Pt, r: BoardRect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

/** 선분 a-b가 사각형 r과 겹치나 — 끝점이 안에 있거나, 네 변 중 하나와 교차. */
function segmentTouchesRect(a: Pt, b: Pt, r: BoardRect): boolean {
  if (inside(a, r) || inside(b, r)) return true;
  // 선분의 경계 상자가 사각형 밖이면 교차할 수 없다.
  if (
    Math.max(a.x, b.x) < r.left ||
    Math.min(a.x, b.x) > r.right ||
    Math.max(a.y, b.y) < r.top ||
    Math.min(a.y, b.y) > r.bottom
  ) {
    return false;
  }
  // Liang–Barsky: 선분이 사각형을 지나는 매개변수 구간이 비어 있지 않은가.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a.x - r.left) &&
    clip(dx, r.right - a.x) &&
    clip(-dy, a.y - r.top) &&
    clip(dy, r.bottom - a.y)
  );
}

/** 획 하나가 지나는 자리의 경계 상자(굵기 절반을 더한다). 점이 없으면 null. */
export function strokeBounds(stroke: Pick<WallStroke, "points" | "width">): BoardRect | null {
  if (stroke.points.length === 0) return null;
  const pad = markerWidthUnits(stroke.width) / 2;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of stroke.points) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}

function rectsOverlap(a: BoardRect, b: BoardRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** 이 획이 상자에 닿았나. 점 하나짜리(탭)는 그 점이 상자 안(또는 굵기 안)에 있으면 닿은 것이다. */
export function strokeTouchesRect(
  stroke: Pick<WallStroke, "points" | "width">,
  box: BoardRect,
): boolean {
  const bounds = strokeBounds(stroke);
  if (!bounds || !rectsOverlap(bounds, box)) return false;
  const pad = markerWidthUnits(stroke.width) / 2;
  // 획의 굵기만큼 상자를 넓혀 중심선과 비교한다 — 굵은 획이 가장자리에 스치기만 해도 닿은 것.
  const grown: BoardRect = {
    left: box.left - pad,
    top: box.top - pad,
    right: box.right + pad,
    bottom: box.bottom + pad,
  };
  const pts = stroke.points;
  if (pts.length === 1) return inside(pts[0], grown);
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (segmentTouchesRect(pts[i], pts[i + 1], grown)) return true;
  }
  return false;
}

/** 상자에 닿은 벽 획의 id. 그린 순서를 지킨다. */
export function wallStrokesTouching(strokes: readonly WallStroke[], box: BoardRect): string[] {
  const hits: string[] = [];
  for (const s of strokes) if (strokeTouchesRect(s, box)) hits.push(s.id);
  return hits;
}

/** 여러 획을 한 테두리로 묶는다. 하나도 없으면 null. */
export function unionBounds(
  strokes: readonly Pick<WallStroke, "points" | "width">[],
): BoardRect | null {
  let out: BoardRect | null = null;
  for (const s of strokes) {
    const b = strokeBounds(s);
    if (!b) continue;
    out = out
      ? {
          left: Math.min(out.left, b.left),
          top: Math.min(out.top, b.top),
          right: Math.max(out.right, b.right),
          bottom: Math.max(out.bottom, b.bottom),
        }
      : b;
  }
  return out;
}
