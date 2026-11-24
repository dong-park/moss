"use client";

import { useRef, useState, type RefObject } from "react";
import type { HandwritingPoint } from "@/state/cardContent";
import {
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_WIDTH,
  type MarkerColor,
  type MarkerWidth,
} from "@/state/marker/tokens";

/* ─────────────────────────────────────────────────────────────
 * FEAT-pen-drawing-engine / wall-marker n3 — 단일 드로잉 코어 엔진 (hook).
 *
 * 메모 overlay(DrawingLayer)·handwriting 카드·벽(보드 좌표)·기운 포스트잇(자기 좌표)이
 * 모두 이 엔진 하나를 쓴다. 갈래별로 복제하지 않는다 — 펜 버그는 여기 한 곳만 고친다.
 *
 * 책임:
 *  - 포인터 → draft 누적, 끝나면 확정 획(onCommit) 또는 지우기 결과(onErase)를 밖에 알린다.
 *  - 좌표 변환(toLocal)은 밖에서 받는다. 기본값은 SVG 박스 기준 1:1 상대 픽셀이다.
 *  - 천(eraser)은 문지른 부분만 지운다 — 획을 잘라 남은 조각을 새 획으로 낸다([[eraseArea]]).
 *  - 두 번째 포인터가 닿으면 그리던 획을 버리고 onCancel을 부른다(줌·팬으로 넘기기 위해
 *    그 이벤트는 가로채지 않는다).
 * 비책임(호출측 소유): 색·굵기 선택, 저장, undo/redo, 키보드, 렌더.
 *
 * A1: 호출측 콜백은 setState 업데이터 "밖"(이벤트 핸들러 본문)에서 부른다 — render 단계
 *     cross-component setState("Cannot update a component while rendering") 경고를 피한다.
 * D2: 탭(점 1개)도 저장한다. 둥근 linecap이 점으로 보이도록 같은 점 2개(0-길이 세그먼트)로 낸다.
 * ───────────────────────────────────────────────────────────── */

export type DrawingTool = "pen" | "eraser";

/** 펜 굵기 한계·기본값 — 메모 overlay·handwriting 공통 단일 소스. */
export const PEN_MIN_WIDTH = 1;
export const PEN_MAX_WIDTH = 12;
export const PEN_DEFAULT_WIDTH = 1.5;

/** 지우개 근접 판정 임계 (px). */
const ERASER_THRESHOLD = 8;

/**
 * 확정할 때 이전 점과 이 거리(저장 좌표 단위) 미만인 점은 건너뛴다 — 보이는 모양은 같고
 * 저장·동기화되는 점이 줄어든다. 가장 작은 마카 굵기(2)의 절반보다 작아 눈에 안 띈다.
 */
export const MIN_POINT_DISTANCE = 0.75;

/** 직전에 남긴 점에서 `minDistance` 미만인 점을 건너뛴다. 첫 점과 끝 점은 반드시 남는다. */
export function dropNearPoints(
  points: readonly HandwritingPoint[],
  minDistance: number = MIN_POINT_DISTANCE,
): HandwritingPoint[] {
  if (points.length <= 2) return [...points];
  const min2 = minDistance * minDistance;
  const out: HandwritingPoint[] = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy >= min2) {
      out.push(p);
      last = p;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** 엔진이 다루는 확정 획. 벽 획(WallStroke)·포스트잇 획 모두 이 모양으로 맞춰 넘긴다. */
export interface DrawingStroke {
  id: string;
  points: HandwritingPoint[];
  color: MarkerColor;
  width: MarkerWidth;
}

/** 방금 그은 획 — id는 저장하는 쪽이 정한다. */
export interface NewDrawingStroke {
  points: HandwritingPoint[];
  color: MarkerColor;
  width: MarkerWidth;
}

/** 지우개가 남긴 조각 — 어느 획에서 나왔는지(`sourceId`) 안다. 쌓임 순서를 이어받는 데 쓴다. */
export interface ErasePiece extends DrawingStroke {
  sourceId: string;
}

export interface EraseResult {
  /** 문지른 자리에 닿은 획의 id. 통째로 지워졌든 잘렸든 원본은 여기 든다. */
  removedIds: string[];
  /** 잘리고 남은 조각 — 원본 색·굵기를 이어받고 새 id를 받는다. */
  added: ErasePiece[];
}

/** path A·B가 시각적으로 교차하는지 간이 판정 — 점 단위 근접 검사. */
export function pathsIntersect(
  a: HandwritingPoint[],
  b: HandwritingPoint[],
  threshold: number = ERASER_THRESHOLD,
): boolean {
  const t2 = threshold * threshold;
  for (const pa of a) {
    for (const pb of b) {
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      if (dx * dx + dy * dy <= t2) return true;
    }
  }
  return false;
}

let pieceSeq = 0;
/** 새 획·조각의 id — 엔진 호출측(포스트잇 overlay)이 새 획에 싣는다. */
export function newPieceId(): string {
  pieceSeq += 1;
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `piece-${rand}-${pieceSeq}`;
}

interface Sample extends HandwritingPoint {
  /** 원래 획의 점인가. 아니면 세그먼트를 잘게 나눠 만든 판정용 점이다. */
  orig: boolean;
}

/**
 * 선분 하나에서 만드는 판정용 표본 수의 상한. 점이 아주 성긴 직선(또는 원격이 넣은 거대 좌표)이
 * 표본을 수십만 개 만들어 탭을 멈추게 하지 못하게 한다. 보드 좌표 한계(BOARD_COORD_MAX)
 * 안의 정상 획은 이 상한에 걸리지 않는다.
 */
const MAX_SAMPLES_PER_SEGMENT = 2048;

/** 경계 상자(닦은 경로 + 반경). 이 상자와 겹치지 않는 선분은 닿을 수 없다. */
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 획을 radius/2 간격 이하로 잘게 나눈다 — 점이 성긴 직선도 문지른 만큼만 잘리게 한다.
 * 유한하지 않은 좌표의 점은 버린다(원격 입력). 선분당 표본 수에는 상한이 있다.
 * `near`를 주면 그 상자와 겹치지 않는 선분은 안쪽 표본을 만들지 않는다 — 어차피 닿지 못한다.
 */
function densify(points: HandwritingPoint[], radius: number, near?: Bounds): Sample[] {
  const step = Math.max(radius / 2, 0.5);
  const out: Sample[] = [];
  let prev: HandwritingPoint | null = null;
  for (const cur of points) {
    if (!Number.isFinite(cur.x) || !Number.isFinite(cur.y)) continue;
    if (prev) {
      const outside =
        near !== undefined &&
        (Math.max(prev.x, cur.x) < near.minX ||
          Math.min(prev.x, cur.x) > near.maxX ||
          Math.max(prev.y, cur.y) < near.minY ||
          Math.min(prev.y, cur.y) > near.maxY);
      const len = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (!outside && Number.isFinite(len)) {
        const n = Math.min(Math.ceil(len / step), MAX_SAMPLES_PER_SEGMENT);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          out.push({
            x: prev.x + (cur.x - prev.x) * t,
            y: prev.y + (cur.y - prev.y) * t,
            orig: false,
          });
        }
      }
    }
    out.push({ x: cur.x, y: cur.y, orig: true });
    prev = cur;
  }
  return out;
}

/**
 * 닦은 경로를 솎는다 — 직전에 남긴 점에서 radius/2 이상 움직인 점만 남긴다(끝 점은 반드시).
 * 포인터 이동 이벤트는 점이 촘촘해서, 그대로 두면 선분 수만 늘고 지우는 범위는 같다.
 * 유한하지 않은 점은 버린다.
 */
function thinWipe(path: readonly HandwritingPoint[], radius: number): HandwritingPoint[] {
  const minStep = Math.max(radius / 2, 0.5);
  const minStep2 = minStep * minStep;
  const out: HandwritingPoint[] = [];
  let last: HandwritingPoint | null = null;
  let tail: HandwritingPoint | null = null;
  for (const p of path) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const pt = { x: p.x, y: p.y };
    tail = pt;
    if (last === null) {
      out.push(pt);
      last = pt;
      continue;
    }
    const dx = pt.x - last.x;
    const dy = pt.y - last.y;
    if (dx * dx + dy * dy >= minStep2) {
      out.push(pt);
      last = pt;
    }
  }
  if (tail !== null && last !== tail) out.push(tail);
  return out;
}

/** 한 선분의 경계 상자가 이만큼 넘는 칸을 덮으면 격자에 넣지 않고 매번 검사한다. */
const MAX_CELLS_PER_WIPE_SEGMENT = 64;
/** 격자 칸 수 상한 — 경로가 아주 넓으면 칸을 키운다(후보가 늘 뿐 결과는 같다). */
const MAX_GRID_CELLS = 250_000;

/**
 * 닦은 경로의 선분을 격자에 넣어 둔다. 표본 하나는 자기 칸의 선분만 검사하면 된다 — 선분은
 * 반경만큼 부풀린 상자가 닿는 모든 칸에 들어 있기 때문이다. 격자 밖의 점은 경로에서 반경
 * 넘게 떨어져 있어 닿을 수 없다.
 */
function buildWipeIndex(wipe: readonly HandwritingPoint[], radius: number) {
  const r2 = radius * radius;
  const segs: number[] = []; // ax, ay, bx, by를 이어 붙인다
  if (wipe.length === 1) segs.push(wipe[0].x, wipe[0].y, wipe[0].x, wipe[0].y);
  for (let i = 0; i + 1 < wipe.length; i++) {
    segs.push(wipe[i].x, wipe[i].y, wipe[i + 1].x, wipe[i + 1].y);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of wipe) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const originX = minX - radius;
  const originY = minY - radius;
  const width = maxX - minX + radius * 2;
  const height = maxY - minY + radius * 2;
  let cell = Math.max(radius * 2, 1);
  if ((width / cell + 1) * (height / cell + 1) > MAX_GRID_CELLS) {
    cell = Math.max(cell, Math.sqrt((width * height) / MAX_GRID_CELLS) * 1.05);
  }
  const cols = Math.floor(width / cell) + 1;
  const rows = Math.floor(height / cell) + 1;

  const cells: Array<number[] | undefined> = new Array(cols * rows);
  const wide: number[] = [];
  for (let i = 0; i < segs.length; i += 4) {
    const cx0 = Math.floor((Math.min(segs[i], segs[i + 2]) - radius - originX) / cell);
    const cx1 = Math.floor((Math.max(segs[i], segs[i + 2]) + radius - originX) / cell);
    const cy0 = Math.floor((Math.min(segs[i + 1], segs[i + 3]) - radius - originY) / cell);
    const cy1 = Math.floor((Math.max(segs[i + 1], segs[i + 3]) + radius - originY) / cell);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_CELLS_PER_WIPE_SEGMENT) {
      wide.push(i);
      continue;
    }
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = cy * cols + cx;
        const list = cells[k];
        if (list) list.push(i);
        else cells[k] = [i];
      }
    }
  }
  const segHit = (i: number, px: number, py: number): boolean => {
    const ax = segs[i];
    const ay = segs[i + 1];
    const abx = segs[i + 2] - ax;
    const aby = segs[i + 3] - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const dx = px - (ax + abx * t);
    const dy = py - (ay + aby * t);
    return dx * dx + dy * dy <= r2;
  };
  return (px: number, py: number): boolean => {
    const cx = Math.floor((px - originX) / cell);
    const cy = Math.floor((py - originY) / cell);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    const list = cells[cy * cols + cx];
    if (list) for (const i of list) if (segHit(i, px, py)) return true;
    for (const i of wide) if (segHit(i, px, py)) return true;
    return false;
  };
}

/**
 * 천으로 문지른 부분만 지운다(D8=A). 문지른 경로(wipePath)에서 radius 안에 든 구간을 잘라
 * 내고, 남은 양쪽을 새 획으로 낸다. 순수 함수 — 저장은 호출측이 한다.
 *
 * - 닿지 않은 획은 결과에 들지 않는다.
 * - 조각이 점 1개 이하면 버린다.
 * - 조각 끝은 판정용 표본 점에 떨어지므로 자르는 위치 오차는 radius/2 이내다.
 * - 닦은 경로는 radius/2 간격으로 솎고 격자로 후보 선분을 좁힌다 — 손을 뗄 때의 비용이
 *   (경로 점 수 × 획 표본 수)가 아니라 (표본 수 × 이웃 선분 몇 개)다.
 */
export function eraseArea(
  strokes: readonly DrawingStroke[],
  wipePath: readonly HandwritingPoint[],
  radius: number,
  newId: () => string = newPieceId,
): EraseResult {
  const result: EraseResult = { removedIds: [], added: [] };
  if (wipePath.length === 0 || strokes.length === 0) return result;

  const wipe = thinWipe(wipePath, radius);
  if (wipe.length === 0) return result;
  const touches = buildWipeIndex(wipe, radius);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of wipe) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const near: Bounds = {
    minX: minX - radius,
    minY: minY - radius,
    maxX: maxX + radius,
    maxY: maxY + radius,
  };

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;

    // 박스가 겹치지 않으면 닿을 수 없다 — 판정용 점을 만들기 전에 거른다.
    let sMinX = Infinity;
    let sMinY = Infinity;
    let sMaxX = -Infinity;
    let sMaxY = -Infinity;
    for (const p of pts) {
      if (p.x < sMinX) sMinX = p.x;
      if (p.y < sMinY) sMinY = p.y;
      if (p.x > sMaxX) sMaxX = p.x;
      if (p.y > sMaxY) sMaxY = p.y;
    }
    if (sMaxX < near.minX || sMinX > near.maxX || sMaxY < near.minY || sMinY > near.maxY) continue;

    const samples = densify(pts, radius, near);
    const hit = samples.map((s) => touches(s.x, s.y));
    if (!hit.includes(true)) continue;

    result.removedIds.push(stroke.id);

    let run: Sample[] = [];
    const flush = () => {
      if (run.length >= 2) {
        // 판정용 표본은 조각 양 끝에만 남긴다 — 곧은 구간 한가운데 점은 없어도 모양이 같다.
        const last = run.length - 1;
        const points = run
          .filter((s, i) => s.orig || i === 0 || i === last)
          .map(({ x, y }) => ({ x, y }));
        if (points.length >= 2) {
          result.added.push({
            id: newId(),
            sourceId: stroke.id,
            points,
            color: stroke.color,
            width: stroke.width,
          });
        }
      }
      run = [];
    };
    for (let i = 0; i < samples.length; i++) {
      if (hit[i]) flush();
      else run.push(samples[i]);
    }
    flush();
  }
  return result;
}

export interface UseDrawing {
  /** 그리는 중 획의 점(펜·천 공통). 렌더 쪽이 도구에 맞게 그린다. 그리는 중이 아니면 빈 배열. */
  draft: HandwritingPoint[];
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => void;
}

export function useDrawing({
  strokes,
  active,
  tool,
  color = DEFAULT_MARKER_COLOR,
  width = DEFAULT_MARKER_WIDTH,
  eraserRadius = ERASER_THRESHOLD,
  toLocal: toLocalProp,
  acceptPen = false,
  onCommit,
  onErase,
  onCancel,
  svgRef,
}: {
  /** 확정 획 — 천이 닿았는지 판정하는 대상. */
  strokes: readonly DrawingStroke[];
  /** 그리기 활성. false면 포인터 무시(호출측이 pointer-events로 통과 처리). */
  active: boolean;
  tool: DrawingTool;
  /** 새 획에 싣는 색·굵기 이름. */
  color?: MarkerColor;
  width?: MarkerWidth;
  /** 천이 닿는 반경 — 호출측 좌표 단위다(벽은 보드 단위). */
  eraserRadius?: number;
  /** 화면 좌표 → 저장 좌표. 없으면 SVG 박스 기준 1:1 상대 픽셀(카드 안 그리기). */
  toLocal?: (clientX: number, clientY: number) => HandwritingPoint;
  /**
   * D5: active가 아니어도 태블릿 펜(`pointerType === "pen"`)이 닿으면 이 획은 그린다.
   * 손가락·마우스는 여전히 active일 때만. 닿은 포인터가 이 레이어로 곧바로 오지 않는 자리
   * (pointer-events:none)에서는 호출측이 pointerdown을 넘겨 준다.
   */
  acceptPen?: boolean;
  /** 펜으로 한 획을 끝냈다. */
  onCommit: (stroke: NewDrawingStroke) => void;
  /** 천으로 문질러 닿은 획이 있다. 닿은 게 없으면 부르지 않는다. */
  onErase: (result: EraseResult) => void;
  /** 그리던 획을 버렸다(두 번째 포인터가 닿음). */
  onCancel?: () => void;
  /**
   * 호출측이 소유하는 SVG ref(외부 주입). hook이 ref를 반환하면 React 컴파일러가
   * 렌더 중 ref 접근으로 오인하므로(react-hooks/refs), 소유권을 호출부에 둔다.
   */
  svgRef: RefObject<SVGSVGElement | null>;
}): UseDrawing {
  // draft는 그리는 동안 같은 배열에 점을 쌓는다 — 이벤트마다 배열을 통째로 복사하지 않는다.
  // 다시 그리는 신호는 tick이다(렌더 쪽은 매번 draft를 읽는다).
  const [draft, setDraft] = useState<HandwritingPoint[]>([]);
  const [, setTick] = useState(0);
  // draft의 최신 값 — 마지막 move와 up이 같은 렌더에 몰려도 점을 잃지 않는다.
  const draftRef = useRef<HandwritingPoint[]>([]);
  const drawingPointerRef = useRef<number | null>(null);
  // 이 획이 "안 들고 펜으로" 시작됐는가 — 그리는 동안 active가 아니어도 끝까지 간다.
  const penStrokeRef = useRef(false);
  const downPointersRef = useRef<Set<number>>(new Set());

  const toLocal = (clientX: number, clientY: number): HandwritingPoint => {
    if (toLocalProp) return toLocalProp(clientX, clientY);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: +(clientX - rect.left).toFixed(1),
      y: +(clientY - rect.top).toFixed(1),
    };
  };

  const reset = () => {
    drawingPointerRef.current = null;
    draftRef.current = [];
    setDraft([]);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const viaPen = !active && acceptPen && e.pointerType === "pen";
    if (!active && !viaPen) return;
    // 마우스는 포인터가 하나뿐이다 — 놓친 pointerup이 쌓인 흔적은 지운다.
    if (e.pointerType === "mouse") downPointersRef.current.clear();
    downPointersRef.current.add(e.pointerId);

    if (downPointersRef.current.size > 1) {
      // 두 번째 손가락: 그리던 획을 버리고 줌·팬으로 넘긴다. 이벤트는 가로채지 않는다.
      if (drawingPointerRef.current !== null) {
        reset();
        onCancel?.();
      }
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    drawingPointerRef.current = e.pointerId;
    penStrokeRef.current = viaPen;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    draftRef.current = [toLocal(e.clientX, e.clientY)];
    setDraft(draftRef.current);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawingPointerRef.current !== e.pointerId) return;
    if (!active && !penStrokeRef.current) {
      // 그리던 중에 도구를 내려놓았다 — 남은 draft는 버린다.
      reset();
      return;
    }
    draftRef.current.push(toLocal(e.clientX, e.clientY));
    setTick((n) => n + 1);
  };

  const finishStroke = () => {
    const points = draftRef.current;
    reset();
    if (points.length === 0) return;
    if (tool === "eraser") {
      const result = eraseArea(strokes, points, eraserRadius);
      if (result.removedIds.length > 0) onErase(result);
    } else {
      // 가까운 점은 건너뛴다(W11). D2: 점 1개(탭)는 0-길이 세그먼트로 저장 → round linecap이 dot로 렌더.
      const kept = dropNearPoints(points);
      onCommit({
        points: kept.length === 1 ? [kept[0], kept[0]] : kept,
        color,
        width,
      });
    }
  };

  const release = (e: React.PointerEvent<SVGSVGElement>) => {
    downPointersRef.current.delete(e.pointerId);
    if (drawingPointerRef.current !== e.pointerId) return;
    if (!active && !penStrokeRef.current) {
      reset();
      return;
    }
    e.stopPropagation();
    finishStroke();
  };

  return {
    draft,
    onPointerDown,
    onPointerMove,
    onPointerUp: release,
    onPointerCancel: release,
  };
}
