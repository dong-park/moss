"use client";

import { useRef, useState, type RefObject } from "react";
import type { HandwritingPoint } from "@/state/cardContent";

/* ─────────────────────────────────────────────────────────────
 * FEAT-pen-drawing-engine — 단일 드로잉 코어 엔진 (hook).
 *
 * 메모 overlay(DrawingLayer)와 handwriting 카드(useHandwriting)가 각각 중복
 * 구현하던 그리기 코어(toLocal / finishStroke / pathsIntersect / draft 상태)를
 * 이 한 곳으로 수렴한다. 펜 버그는 여기 한 곳만 고치면 양쪽에 반영된다.
 *
 * 책임:
 *  - 포인터 → draft stroke 누적, finishStroke 시 paths 갱신(펜=추가, 지우개=교차 제거).
 *  - 점/지우개 근접 판정(pathsIntersect)·좌표 변환(toLocal)의 유일 정의처.
 * 비책임(호출측 소유): penWidth/tool 상태, undo/redo/clear, 키보드, 렌더.
 *
 * 좌표계: 컬럼이 1:1(CSS scale 없음)이므로 SVG 기준 상대 픽셀이 곧 저장 좌표다.
 *
 * A1: finishStroke는 onPathsChange를 setDraft 업데이터 "밖"(이벤트 핸들러 본문)에서
 *     호출한다 — render 단계 cross-component setState("Cannot update a component
 *     while rendering") 경고를 피한다.
 * D2: 탭(draft.length === 1)도 점으로 저장한다. 펜은 둥근 linecap이 점으로 보이도록
 *     0-길이 세그먼트(동일 점 2개)로 저장해 polyline이 dot로 렌더되게 한다.
 * ───────────────────────────────────────────────────────────── */

export type DrawingTool = "pen" | "eraser";

/** 펜 굵기 한계·기본값 — 메모 overlay·handwriting 공통 단일 소스. */
export const PEN_MIN_WIDTH = 1;
export const PEN_MAX_WIDTH = 12;
export const PEN_DEFAULT_WIDTH = 1.5;

/** 지우개 근접 판정 임계 (px). */
const ERASER_THRESHOLD = 8;

/** path A·B가 시각적으로 교차하는지 간이 판정 — 점 단위 근접 검사. */
export function pathsIntersect(
  a: HandwritingPoint[],
  b: HandwritingPoint[],
): boolean {
  const t2 = ERASER_THRESHOLD * ERASER_THRESHOLD;
  for (const pa of a) {
    for (const pb of b) {
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      if (dx * dx + dy * dy <= t2) return true;
    }
  }
  return false;
}

export interface UseDrawing {
  /** 확정 path + 그리는 중 draft(pen일 때만) — 렌더용. */
  allPaths: HandwritingPoint[][];
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
}

export function useDrawing({
  paths,
  active,
  tool,
  onPathsChange,
  svgRef,
}: {
  paths: HandwritingPoint[][];
  /** 그리기 활성. false면 포인터 무시(호출측이 pointer-events로 통과 처리). */
  active: boolean;
  tool: DrawingTool;
  onPathsChange: (paths: HandwritingPoint[][]) => void;
  /**
   * 호출측이 소유하는 SVG ref(외부 주입). hook이 ref를 반환하면 React 컴파일러가
   * 렌더 중 ref 접근으로 오인하므로(react-hooks/refs), 소유권을 호출부에 둔다.
   */
  svgRef: RefObject<SVGSVGElement | null>;
}): UseDrawing {
  const [draft, setDraft] = useState<HandwritingPoint[]>([]);
  const drawingRef = useRef(false);

  const toLocal = (clientX: number, clientY: number): HandwritingPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: +(clientX - rect.left).toFixed(1),
      y: +(clientY - rect.top).toFixed(1),
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    e.stopPropagation();
    e.preventDefault();
    drawingRef.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    setDraft([toLocal(e.clientX, e.clientY)]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active || !drawingRef.current) return;
    setDraft((prev) => [...prev, toLocal(e.clientX, e.clientY)]);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    // A1: onPathsChange(부모 store 갱신)는 setDraft 업데이터가 아니라 이 핸들러
    // 본문에서 호출한다. draft는 현재 render 클로저에서 읽으므로 최신값이다.
    if (draft.length >= 1) {
      if (tool === "eraser") {
        const next = paths.filter((path) => !pathsIntersect(path, draft));
        if (next.length !== paths.length) {
          onPathsChange(next);
        }
      } else {
        // D2: 점 1개(탭)는 0-길이 세그먼트로 저장 → round linecap이 dot로 렌더.
        const stroke = draft.length === 1 ? [draft[0], draft[0]] : draft;
        onPathsChange([...paths, stroke]);
      }
    }
    setDraft([]);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!active) return;
    e.stopPropagation();
    finishStroke();
  };

  const allPaths =
    draft.length >= 1 && tool === "pen" ? [...paths, draft] : paths;

  return { allPaths, onPointerDown, onPointerMove, onPointerUp };
}
