"use client";

import {
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import { useWorkspace } from "@/state/workspace";
import type { WallStroke } from "@/state/db/schema";
import { drawingToolFor, isPhoneViewport } from "@/state/marker/heldTool";
import { isWallInputBlocked } from "@/state/marker/inputGate";
import { strokeOwnerOf } from "@/state/marker/strokeOwner";
import { markerColorValue, markerWidthUnits } from "@/state/marker/tokens";
import {
  useDrawing,
  type EraseResult,
  type NewDrawingStroke,
} from "./cards/_shared/useDrawing";
import { strokeBounds, unionBounds, type BoardRect } from "./wallStrokeHit";


/* ─────────────────────────────────────────────────────────────
 * wall-marker n4 — 벽 획 레이어. 빈 벽에 쓰고, 지우고, 동기화한다.
 *
 * 구성
 *  - 렌더: 월드 변환 안, 연결선·카드보다 아래(D5: 벽 획 → 연결선 → 포스트잇). 획은 보드 좌표라
 *    팬·줌과 함께 같은 자리에 같은 크기 비율로 보인다. 휴대폰에서도 그린다 — 입력만 받지 않는다.
 *  - 입력: 캔버스 바탕이 포인터를 받는다. 이 레이어가 핸들(WallInput)을 내주고 Canvas가 root의
 *    포인터 이벤트를 거기에 건넨다. 그리기 코어는 n3 엔진(useDrawing) 하나다.
 *  - 주인: 시작점이 주인이다(D4=A). 포스트잇 위에서 시작하면 n5 몫이라 여기서는 받지 않고,
 *    그 밖(빈 벽·메모판·사진…)이면 벽 획이다(D12=A). 그리는 도중 경계를 넘어도 주인은 그대로다.
 *  - 기록: 그리거나 지운 획만 되돌리기 기록에 직접 쌓는다(D9=A) — 원격에서 온 획은 쌓이지 않는다.
 *  - 두 손가락: 그리는 도중 두 번째 손가락이 닿으면 엔진이 획을 버리고(T12), 이 레이어가 그 두
 *    손가락으로 줌·팬을 이어받는다.
 *  - 고르기·옮기기(n6): 마카를 내려놓은 채 고른 벽 획(`selectedWallStrokeIds`)은 하나의 테두리
 *    상자로 묶여 보인다. 상자 안을 잡고 끌면 미리보기로 따라 움직이고, 놓는 순간 한 번만 저장한다
 *    (`moveWallStrokes`). 끄는 도중 Esc면 미리보기를 버리고 묶음은 그대로 둔다(T19).
 *    고르기 판정은 `Canvas`의 고르기 상자 몫이다(`wallStrokeHit.ts`).
 * ───────────────────────────────────────────────────────────── */

/** 천이 닿는 반경 — 화면 px. 포인터 모양(천)과 같은 크기로 닦이도록 화면 기준이고, 보드 단위로는 줌으로 나눈다. */
export const WALL_CLOTH_RADIUS_PX = 12;

/** 방금 그린 획이 두 번 누르기를 포스트잇 만들기로 읽지 않게 하는 시간. */
export const WALL_DRAW_DBLCLICK_GUARD_MS = 500;

export interface WallInput {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  /** 마지막으로 벽에 그리거나 닦은 시각(ms). 없으면 0. */
  lastDrawAt: () => number;
  /** 끌어 옮기는 중이면 미리보기를 버리고 true. 아니면 false(Esc가 다른 일을 하게 둔다). */
  cancelMove: () => boolean;
}

/** 옮기기를 시작하는 최소 이동(화면 px) — 누르기만 한 손 떨림이 저장으로 새지 않게. */
export const WALL_MOVE_THRESHOLD_PX = 3;

/** 묶음 테두리 상자가 획에서 바깥으로 벌어지는 여유(보드 단위). */
const SELECTION_PAD = 6;

interface MoveSession {
  pointerId: number;
  startX: number;
  startY: number;
  ids: string[];
  active: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Point {
  x: number;
  y: number;
}

/** 엔진은 이벤트의 전파를 막는다 — 바탕 위 바깥 클릭 닫기(메뉴)가 죽지 않게 전파 막기만 뺀다. */
function forDrawing(e: React.PointerEvent<HTMLElement>): React.PointerEvent<SVGSVGElement> {
  return {
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    clientX: e.clientX,
    clientY: e.clientY,
    stopPropagation: () => {},
    preventDefault: () => e.preventDefault(),
  } as unknown as React.PointerEvent<SVGSVGElement>;
}

/** 획별 `points` 속성 문자열 — 같은 획 객체는 한 번만 만든다(그룹이 다시 그려져도 문자열을 다시 짓지 않는다). */
const pointsAttrCache = new WeakMap<WallStroke, string>();
function pointsAttr(stroke: WallStroke): string {
  let v = pointsAttrCache.get(stroke);
  if (v === undefined) {
    v = stroke.points.map((p) => `${p.x},${p.y}`).join(" ");
    pointsAttrCache.set(stroke, v);
  }
  return v;
}

/** 획별 경계 상자 캐시 — 화면 밖 판정이 팬 구역이 바뀔 때마다 점을 다시 훑지 않게 한다. */
const boundsCache = new WeakMap<WallStroke, BoardRect | null>();
function cachedBounds(stroke: WallStroke): BoardRect | null {
  let v = boundsCache.get(stroke);
  if (v === undefined) {
    v = strokeBounds(stroke);
    boundsCache.set(stroke, v);
  }
  return v;
}

const WallStrokePath = memo(function WallStrokePath({
  stroke,
  selected,
}: {
  stroke: WallStroke;
  /** 고른 묶음에 든 획. */
  selected: boolean;
}) {
  return (
    <polyline
      data-wall-stroke={stroke.id}
      data-color={stroke.color}
      data-selected={selected ? "true" : undefined}
      points={pointsAttr(stroke)}
      fill="none"
      stroke={markerColorValue(stroke.color)}
      strokeWidth={markerWidthUnits(stroke.width)}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});

/** 고르지 않은 획의 연속 구간 — 팬·그리기·옮기기 중에 다시 그려지지 않는다. */
const StaticRun = memo(function StaticRun({ strokes }: { strokes: readonly WallStroke[] }) {
  return (
    <>
      {strokes.map((s) => (
        <WallStrokePath key={s.id} stroke={s} selected={false} />
      ))}
    </>
  );
});

/**
 * 고른 획의 연속 구간. 옮기는 중에는 이 <g>의 transform 하나만 바뀐다 — 획마다 점 문자열을
 * 다시 짓지 않는다. 구간 단위로 묶어 두므로 그린 순서(쌓임)는 그대로다.
 */
const SelectedRun = memo(function SelectedRun({
  strokes,
  dx,
  dy,
}: {
  strokes: readonly WallStroke[];
  dx: number;
  dy: number;
}) {
  return (
    <g
      data-wall-move-group="true"
      transform={dx !== 0 || dy !== 0 ? `translate(${dx} ${dy})` : undefined}
    >
      {strokes.map((s) => (
        <WallStrokePath key={s.id} stroke={s} selected />
      ))}
    </g>
  );
});

interface Run {
  selected: boolean;
  strokes: WallStroke[];
}

/** 그린 순서를 지킨 채 "고름/안 고름" 연속 구간으로 나눈다. */
function buildRuns(strokes: readonly WallStroke[], selectedSet: ReadonlySet<string>): Run[] {
  const runs: Run[] = [];
  for (const s of strokes) {
    const selected = selectedSet.has(s.id);
    const last = runs[runs.length - 1];
    if (last && last.selected === selected) last.strokes.push(s);
    else runs.push({ selected, strokes: [s] });
  }
  return runs;
}

/**
 * 화면 밖 획을 거르는 구역 키. 뷰포트 한 화면을 반 화면 칸에 맞춰 양자화한다 — 팬이 같은 칸
 * 안에 머무는 동안 키가 같아 목록이 다시 만들어지지 않는다. 줌이 바뀌면 키가 바뀐다.
 */
function cullKeySelector(s: { viewport: { x: number; y: number; scale: number } }): string {
  const { x, y, scale } = s.viewport;
  const k = scale > 0 ? scale : 1;
  const w = (typeof window === "undefined" ? 1280 : window.innerWidth) / k;
  const h = (typeof window === "undefined" ? 800 : window.innerHeight) / k;
  const stepX = Math.max(w / 2, 1);
  const stepY = Math.max(h / 2, 1);
  const cx = Math.floor(-x / k / stepX);
  const cy = Math.floor(-y / k / stepY);
  return `${cx}|${cy}|${stepX}|${stepY}|${w}|${h}`;
}

/** 키가 가리키는 구역(보드 좌표) — 보이는 칸 둘레에 반 화면씩 여유를 둔다. */
function cullRegion(key: string): BoardRect {
  const [cx, cy, stepX, stepY, w, h] = key.split("|").map(Number);
  const left = cx * stepX;
  const top = cy * stepY;
  return {
    left: left - w / 2,
    top: top - h / 2,
    // 보이는 상자의 왼쪽은 [left, left+step) 어디든 가능 — 오른쪽 끝은 left+step+w.
    right: left + stepX + w + w / 2,
    bottom: top + stepY + h + h / 2,
  };
}

function rectsOverlap(a: BoardRect, b: BoardRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/**
 * 정적 획 목록. 그리는 중 미리보기·묶음 테두리는 이 컴포넌트 밖이라 그 갱신이 여기로 오지 않는다.
 * 팬·줌은 화면 밖 판정 구역이 바뀔 때만 이 목록을 다시 만든다. 고른 획은 화면 밖이어도 남긴다.
 */
const WallStrokeList = memo(function WallStrokeList({
  strokes,
  selectedSet,
  delta,
}: {
  /** 그린 순서로 정렬된 전체 획. */
  strokes: readonly WallStroke[];
  selectedSet: ReadonlySet<string>;
  /** 옮기는 중 미리보기 이동(보드 단위). */
  delta: Point | null;
}) {
  const cullKey = useWorkspace((s) => cullKeySelector(s));
  const visible = useMemo(() => {
    const region = cullRegion(cullKey);
    return strokes.filter((s) => {
      if (selectedSet.has(s.id)) return true;
      const b = cachedBounds(s);
      return b !== null && rectsOverlap(b, region);
    });
  }, [strokes, selectedSet, cullKey]);
  const runs = useMemo(() => buildRuns(visible, selectedSet), [visible, selectedSet]);
  return (
    <>
      {runs.map((run) =>
        run.selected ? (
          <SelectedRun
            key={`sel-${run.strokes[0].id}`}
            strokes={run.strokes}
            dx={delta?.x ?? 0}
            dy={delta?.y ?? 0}
          />
        ) : (
          <StaticRun key={`run-${run.strokes[0].id}`} strokes={run.strokes} />
        ),
      )}
    </>
  );
});

export const WallStrokeLayer = memo(function WallStrokeLayer({
  ref,
  hostRef,
  suspended = false,
}: {
  ref?: Ref<WallInput>;
  /** 캔버스 root — 화면 좌표를 보드 좌표로 바꿀 때 기준이다. */
  hostRef: RefObject<HTMLElement | null>;
  /** 스페이스 팬·글상자 배치처럼 캔버스가 포인터를 따로 쓰는 동안 그리지 않는다. */
  suspended?: boolean;
}) {
  const wallStrokes = useWorkspace((s) => s.wallStrokes);
  const heldTool = useWorkspace((s) => s.heldTool);
  const lastMarkerColor = useWorkspace((s) => s.lastMarkerColor);
  const markerWidth = useWorkspace((s) => s.markerWidth);
  const scale = useWorkspace((s) => s.viewport.scale);
  const selectedIds = useWorkspace((s) => s.selectedWallStrokeIds);

  /** 끌어 옮기는 중의 미리보기 이동(보드 단위). null이면 옮기는 중이 아니다. */
  const [moveDelta, setMoveDelta] = useState<Point | null>(null);
  const moveRef = useRef<MoveSession | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastDrawAtRef = useRef(0);
  /** 엔진에 넘긴 포인터 — 놓일 때까지 엔진이 두 손가락을 셀 수 있게 끝까지 건넨다. */
  const delegatedRef = useRef<Set<number>>(new Set());
  /** 닿아 있는 손가락 — 두 손가락 줌·팬용. */
  const touchesRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  const cloth = heldTool?.kind === "cloth";
  const color = heldTool?.kind === "marker" ? heldTool.color : lastMarkerColor;

  const toBoard = (clientX: number, clientY: number): Point => {
    const rect = hostRef.current?.getBoundingClientRect();
    const v = useWorkspace.getState().viewport;
    return {
      x: +((clientX - (rect?.left ?? 0) - v.x) / v.scale).toFixed(1),
      y: +((clientY - (rect?.top ?? 0) - v.y) / v.scale).toFixed(1),
    };
  };

  const stamp = () => {
    lastDrawAtRef.current = Date.now();
  };

  const onCommit = (stroke: NewDrawingStroke) => {
    stamp();
    const ws = useWorkspace.getState();
    const added = ws.addWallStroke({
      points: stroke.points,
      color: stroke.color,
      width: stroke.width,
    });
    if (added) ws.recordMarkerEdit({ kind: "wall", before: [], after: [added] });
  };

  const onErase = (result: EraseResult) => {
    stamp();
    const ws = useWorkspace.getState();
    const gone = new Set(result.removedIds);
    const before = ws.wallStrokes.filter((s) => gone.has(s.id));
    const sourceById = new Map(before.map((s) => [s.id, s]));
    const after = ws.replaceWallStrokes(
      result.removedIds,
      result.added.map((a) => ({
        id: a.id,
        points: a.points,
        color: a.color,
        width: a.width,
        // 조각은 원본의 쌓임 자리를 이어받는다 — 귀퉁이를 지워도 위로 튀지 않는다.
        createdAt: sourceById.get(a.sourceId)?.createdAt,
      })),
    );
    if (before.length > 0 || after.length > 0) {
      ws.recordMarkerEdit({ kind: "wall", before, after });
    }
  };

  const drawing = useDrawing({
    strokes: wallStrokes,
    active: true,
    tool: cloth ? "eraser" : "pen",
    color,
    width: markerWidth,
    eraserRadius: WALL_CLOTH_RADIUS_PX / scale,
    toLocal: toBoard,
    onCommit,
    onErase,
    onCancel: stamp,
    svgRef,
  });

  const measure = () => {
    const [a, b] = [...touchesRef.current.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  };

  const trackTouchDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "touch") return;
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinchRef.current = touchesRef.current.size >= 2 ? measure() : null;
  };

  /** 마카·천을 든 동안은 터치가 브라우저 몫이 아니다(touch-action: none) — 두 손가락 줌·팬은 여기서 한다. */
  const trackTouchMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "touch" || !touchesRef.current.has(e.pointerId)) return;
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const prev = pinchRef.current;
    if (!prev || touchesRef.current.size < 2) return;
    const next = measure();
    pinchRef.current = next;
    const ws = useWorkspace.getState();
    if (!ws.heldTool) return;
    const rect = hostRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    if (prev.dist >= 1 && next.dist >= 1) ws.zoomAt(next.dist / prev.dist, next.cx - left, next.cy - top);
    ws.panBy(next.cx - prev.cx, next.cy - prev.cy);
  };

  const trackTouchUp = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "touch") return;
    touchesRef.current.delete(e.pointerId);
    if (touchesRef.current.size < 2) pinchRef.current = null;
    if (touchesRef.current.size === 0) {
      delegatedRef.current.clear();
      drawing.endGesture();
    }
  };

  // 지금 화면에 있는 고른 획만 — 그 사이 지워진 id는 묶음에서 빠진다(지운 쪽이 이긴다).
  const selectedStrokes = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const pick = new Set(selectedIds);
    return wallStrokes.filter((s) => pick.has(s.id));
  }, [wallStrokes, selectedIds]);
  const selectedSet = useMemo(() => new Set(selectedStrokes.map((s) => s.id)), [selectedStrokes]);
  const selectionBounds = useMemo(() => unionBounds(selectedStrokes), [selectedStrokes]);

  const abandonMove = (): boolean => {
    if (!moveRef.current) return false;
    moveRef.current = null;
    setMoveDelta(null);
    return true;
  };

  // 마카·천을 집거나(묶음이 풀린다) 묶음이 비면 진행 중이던 옮기기는 없던 일이다.
  useEffect(() => {
    if (moveRef.current && (heldTool !== null || selectedStrokes.length === 0)) {
      moveRef.current = null;
      setMoveDelta(null);
    }
  }, [heldTool, selectedStrokes.length]);

  const onSelectionPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (suspended || isPhoneViewport() || moveRef.current) return;
    // 마우스 왼쪽·손가락만. 펜은 아무것도 안 들어도 마지막 마카로 쓴다(D5) — 옮기지 않는다.
    if (e.pointerType === "pen") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (useWorkspace.getState().heldTool) return;
    if (selectedStrokes.length === 0) return;
    moveRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      ids: selectedStrokes.map((s) => s.id),
      active: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  /** 놓기 전까지 누른 자리에서 얼마나 움직였나(보드 단위). */
  const moveOffset = (m: MoveSession, clientX: number, clientY: number): Point => {
    const k = useWorkspace.getState().viewport.scale || 1;
    return { x: round1((clientX - m.startX) / k), y: round1((clientY - m.startY) / k) };
  };

  const onSelectionPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const m = moveRef.current;
    if (!m || m.pointerId !== e.pointerId) return;
    if (!m.active) {
      if (Math.hypot(e.clientX - m.startX, e.clientY - m.startY) < WALL_MOVE_THRESHOLD_PX) return;
      m.active = true;
    }
    setMoveDelta(moveOffset(m, e.clientX, e.clientY));
  };

  const onSelectionPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    const m = moveRef.current;
    if (!m || m.pointerId !== e.pointerId) return;
    moveRef.current = null;
    setMoveDelta(null);
    if (!m.active) return;
    const d = moveOffset(m, e.clientX, e.clientY);
    // 놓은 순간 한 번만 저장한다. 그 사이 지워진 획은 되살리지 않는다.
    useWorkspace.getState().moveWallStrokes(m.ids, d.x, d.y);
  };

  const onSelectionPointerCancel = (e: React.PointerEvent<SVGRectElement>) => {
    const m = moveRef.current;
    if (!m || m.pointerId !== e.pointerId) return;
    abandonMove();
  };

  useImperativeHandle(ref, () => ({
    onPointerDown: (e) => {
      trackTouchDown(e);
      // 마우스는 포인터가 하나뿐이다 — 창 밖에서 놓쳐 쌓인 흔적은 지운다.
      if (e.pointerType === "mouse") delegatedRef.current.clear();
      if (delegatedRef.current.size === 0 && touchesRef.current.size > 1) {
        touchesRef.current.clear();
        touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      // 휴대폰에는 입력이 없다(T14) — 이미 있는 획만 보인다.
      if (isPhoneViewport()) return;
      const drawingNow = delegatedRef.current.size > 0;
      // 그리는 중에 닿은 두 번째 포인터는 어디에 닿았든 엔진이 받아 획을 버리게 한다(T12).
      if (!drawingNow) {
        if (suspended) return;
        // 보드 전환 중·첫 벽 공유가 내용을 옮기는 중에는 새 획을 받지 않는다(W5).
        if (useWorkspace.getState().boardTransitioning || isWallInputBlocked()) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const ws = useWorkspace.getState();
        if (!drawingToolFor(ws.heldTool, e.pointerType, ws.lastMarkerColor)) return;
        // 아무것도 안 든 펜은 글 고치는 중에 그리지 않는다(마카를 든 채 글을 고치는 상태를 안 만든다).
        if (!ws.heldTool && ws.editingId) return;
        // 이미 두 손가락이 닿아 있다면 새 획이 아니라 줌·팬이다.
        if (touchesRef.current.size >= 2) return;
        // 시작점이 주인이다(D4=A) — 벽 것이 아니면(포스트잇 위·캔버스 UI 위) 받지 않는다.
        if (strokeOwnerOf(e.target, e.currentTarget).kind !== "wall") return;
      }
      delegatedRef.current.add(e.pointerId);
      drawing.onPointerDown(forDrawing(e));
    },
    onPointerMove: (e) => {
      trackTouchMove(e);
      if (!delegatedRef.current.has(e.pointerId)) return;
      drawing.onPointerMove(forDrawing(e));
    },
    onPointerUp: (e) => {
      if (delegatedRef.current.delete(e.pointerId)) drawing.onPointerUp(forDrawing(e));
      trackTouchUp(e);
    },
    onPointerCancel: (e) => {
      trackTouchUp(e);
      if (!delegatedRef.current.delete(e.pointerId)) return;
      drawing.onPointerCancel(forDrawing(e));
    },
    lastDrawAt: () => lastDrawAtRef.current,
    cancelMove: abandonMove,
  }));

  // 쌓임 순서(createdAt, id)는 스토어의 wallStrokes가 이미 지킨다 — 문서 읽기·원격 반영·쓰기가
  // 모두 같은 비교자(compareStrokeOrder)로 정렬해 둔다. 여기서 다시 정렬하지 않는다.
  const ordered = wallStrokes;

  // 그리는 중 획만 미리 보인다 — 천의 draft는 문지른 경로일 뿐 획이 아니다.
  const draftPoints = !cloth && drawing.draft.length >= 1 ? drawing.draft : null;

  return (
    <svg
      ref={svgRef}
      data-wall-stroke-layer="true"
      aria-hidden
      width={1}
      height={1}
      className="absolute left-0 top-0"
      // 메모판(z auto)보다 위, 연결선(z 5)·카드(z 10)보다 아래.
      style={{ overflow: "visible", zIndex: 1, pointerEvents: "none" }}
    >
      <WallStrokeList strokes={ordered} selectedSet={selectedSet} delta={moveDelta} />
      {selectionBounds && (
        <rect
          data-wall-selection="true"
          data-count={selectedStrokes.length}
          data-moving={moveDelta ? "true" : undefined}
          x={selectionBounds.left - SELECTION_PAD + (moveDelta?.x ?? 0)}
          y={selectionBounds.top - SELECTION_PAD + (moveDelta?.y ?? 0)}
          width={selectionBounds.right - selectionBounds.left + SELECTION_PAD * 2}
          height={selectionBounds.bottom - selectionBounds.top + SELECTION_PAD * 2}
          rx={3}
          fill="rgba(79, 124, 243, 0.05)"
          stroke="rgba(79, 124, 243, 0.8)"
          strokeWidth={1}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
          // 레이어는 포인터를 안 받지만 묶음 상자만은 받는다 — 상자 안을 잡고 끌어 옮긴다.
          style={{ pointerEvents: "all", cursor: "move", touchAction: "none" }}
          onPointerDown={onSelectionPointerDown}
          onPointerMove={onSelectionPointerMove}
          onPointerUp={onSelectionPointerUp}
          onPointerCancel={onSelectionPointerCancel}
        />
      )}
      {draftPoints && (
        <polyline
          data-wall-draft="true"
          points={draftPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={markerColorValue(color)}
          strokeWidth={markerWidthUnits(markerWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
});
