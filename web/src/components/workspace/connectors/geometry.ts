import type { ConnectionSide } from "@/state/db/schema";
import type { Card, CardKind, Viewport } from "@/state/workspace";

/**
 * FEAT-connectors: 연결점을 띄울 카드 종류. 한 곳에 모아 둔다 — [[FEAT-text-tool]]이
 * "textbox" kind를 이 브랜치에 들여오면 이 배열에 한 줄만 추가하면 된다.
 * 메모판(frame)은 제외(판 테두리 hover가 안쪽 핸들과 다툰다, spec §0).
 */
export const CONNECTABLE_KINDS: readonly CardKind[] = ["text", "board"];

export function isConnectableCard(card: Card): boolean {
  return CONNECTABLE_KINDS.includes(card.kind);
}

export interface Point {
  x: number;
  y: number;
}

/** rect 계산용 최소 형태 — Card의 height 미정의 시 width로 정사각 취급. */
export interface RectLike {
  x: number;
  y: number;
  width: number;
  height?: number;
}

function heightOf(rect: RectLike): number {
  return rect.height ?? rect.width;
}

/** 변의 바깥 법선 방향. */
export const SIDE_NORMALS: Record<ConnectionSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const MIN_CONTROL = 40;
const MAX_CONTROL = 160;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** 변 중앙의 월드 좌표. */
export function anchorPoint(rect: RectLike, side: ConnectionSide): Point {
  const h = heightOf(rect);
  switch (side) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + h };
    case "left":
      return { x: rect.x, y: rect.y + h / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + h / 2 };
  }
}

/**
 * 점에서 가장 가까운 변. 각 변까지의 정규화 거리(|dx|/(w/2) vs |dy|/(h/2))를 비교한다 —
 * 카드가 정사각이 아니어도 변 길이에 휘둘리지 않는다.
 */
export function nearestSide(rect: RectLike, point: Point): ConnectionSide {
  const h = heightOf(rect);
  const dx = point.x - (rect.x + rect.width / 2);
  const dy = point.y - (rect.y + h / 2);
  const halfW = rect.width / 2;
  const halfH = h / 2;
  const nx = halfW === 0 ? Infinity : Math.abs(dx) / halfW;
  const ny = halfH === 0 ? Infinity : Math.abs(dy) / halfH;
  if (nx >= ny) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/**
 * 두 카드의 지정 변을 잇는 베지어 곡선의 네 제어점. path 문자열과 달리 좌표를 그대로
 * 들고 있어, 라벨 위치 계산이 문자열을 정규식으로 재파싱하지 않아도 된다(지수 표기 안전).
 */
export interface ConnectorGeometry {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

/**
 * 두 카드의 지정 변을 잇는 베지어 곡선 제어점. 제어점은 각 끝에서 변 법선 방향으로
 * clamp(두 앵커 거리/2, 40, 160)만큼 뻗는다(spec §6).
 */
export function connectorGeometry(
  a: RectLike,
  aSide: ConnectionSide,
  b: RectLike,
  bSide: ConnectionSide,
): ConnectorGeometry {
  const p0 = anchorPoint(a, aSide);
  const p1 = anchorPoint(b, bSide);
  const d = clamp(Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2, MIN_CONTROL, MAX_CONTROL);
  const na = SIDE_NORMALS[aSide];
  const nb = SIDE_NORMALS[bSide];
  return {
    p0,
    c1: { x: p0.x + na.x * d, y: p0.y + na.y * d },
    c2: { x: p1.x + nb.x * d, y: p1.y + nb.y * d },
    p1,
  };
}

/**
 * 곡선 제어점을 SVG path 문자열로. connectorPath와 같은 포맷.
 */
export function geometryPath(g: ConnectorGeometry): string {
  const { p0, c1, c2, p1 } = g;
  return `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`;
}

/**
 * 두 카드의 지정 변을 잇는 베지어 곡선 path. 제어점은 connectorGeometry와 동일하다.
 */
export function connectorPath(
  a: RectLike,
  aSide: ConnectionSide,
  b: RectLike,
  bSide: ConnectionSide,
): string {
  return geometryPath(connectorGeometry(a, aSide, b, bSide));
}

/**
 * 대상 없이 포인터까지 이어지는 미리보기 곡선. 시작은 변 법선 방향으로 뻗고
 * 끝은 포인터 그대로(제어점 = 도착점)라 자연스럽게 휜다.
 */
export function connectorPathToPoint(
  rect: RectLike,
  side: ConnectionSide,
  point: Point,
): string {
  const pa = anchorPoint(rect, side);
  const d = clamp(Math.hypot(point.x - pa.x, point.y - pa.y) / 2, MIN_CONTROL, MAX_CONTROL);
  const n = SIDE_NORMALS[side];
  const c1 = { x: pa.x + n.x * d, y: pa.y + n.y * d };
  return `M ${pa.x} ${pa.y} C ${c1.x} ${c1.y}, ${point.x} ${point.y}, ${point.x} ${point.y}`;
}

/**
 * 베지어 곡선(t=0.5)의 중간점. 라벨 위치 계산용. path 문자열 재파싱 대신 제어점을
 * 직접 받아 지수 표기 등에 영향받지 않는다.
 */
export function bezierMidpoint(
  p0: Point,
  c1: Point,
  c2: Point,
  p1: Point,
): Point {
  return {
    x: 0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p1.x,
    y: 0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p1.y,
  };
}

/** 클라이언트(화면) 좌표 → 캔버스 월드 좌표. */
export function clientToWorld(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number },
  viewport: Viewport,
): Point {
  return {
    x: (clientX - canvasRect.left - viewport.x) / viewport.scale,
    y: (clientY - canvasRect.top - viewport.y) / viewport.scale,
  };
}
