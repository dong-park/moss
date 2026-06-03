"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-markdown-memo-pen / FEAT-pen-drawing-engine — 공유 그리기 레이어.
 *
 * 메모 카드 overlay(text/Content) + 펼침 모달(MemoExpandDialog)이 공용하는
 * 렌더 컴포넌트. 그리기 코어(toLocal/finishStroke/pathsIntersect/draft)는
 * 단일 엔진 [[useDrawing]]으로 수렴했고, 여기는 그 얇은 호출부다:
 *  - value(직렬화 paths) ↔ onChange(json)만 책임지고 나머지는 엔진에 위임.
 *  - undo/redo/clear/굵기·도구 토글 = 호출측 소유(펜 모드 전역).
 *
 * active=false면 pointer-events:none → 클릭이 카드(드래그/편집)로 통과한다.
 *
 * 좌표계: 부모 컬럼(고정 폭 [[MEMO_CONTENT_WIDTH]])을 가득 채우는 1:1 픽셀 좌표.
 * 카드와 모달이 같은 고정 폭 컬럼 위에 이 레이어를 1:1로 얹으므로, stroke가 카드↔
 * 모달 어디서 그려져도 동일 좌표공간에 저장되고 같은 글자 위에 정렬된다(viewBox 없음).
 * ───────────────────────────────────────────────────────────── */

import { useMemo, useRef } from "react";
import { parseHandwriting, serializeHandwriting } from "@/state/cardContent";
import { useDrawing, type DrawingTool } from "./useDrawing";

export type { DrawingTool };

export type DrawingLayerProps = {
  value: string;
  active: boolean;
  penWidth: number;
  tool: DrawingTool;
  onChange: (json: string) => void;
  /** stroke 색 (CSS 변수). 기본 본문색. */
  stroke?: string;
};

export function DrawingLayer({
  value,
  active,
  penWidth,
  tool,
  onChange,
  stroke = "var(--color-text)",
}: DrawingLayerProps) {
  const data = useMemo(() => parseHandwriting(value), [value]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawing = useDrawing({
    paths: data.paths,
    active,
    tool,
    onPathsChange: (paths) => onChange(serializeHandwriting({ paths })),
    svgRef,
  });

  const cursor = active ? (tool === "eraser" ? "cell" : "crosshair") : "default";

  return (
    <svg
      ref={svgRef}
      data-drawing-layer
      onPointerDown={drawing.onPointerDown}
      onPointerMove={drawing.onPointerMove}
      onPointerUp={drawing.onPointerUp}
      onPointerCancel={drawing.onPointerUp}
      onMouseDown={(e) => {
        // active일 때만 카드 드래그 시작을 차단(그리기 보호).
        if (active) e.stopPropagation();
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: active ? "auto" : "none",
        cursor,
        touchAction: "none",
        // 컬럼 밖으로 나간 stroke도 모달에선 다 보이게. 카드는 카드 박스의
        // overflow-hidden이 컬럼 전체를 크롭하므로 여기 visible이어도 무방.
        overflow: "visible",
      }}
    >
      {drawing.allPaths.map((path, i) => (
        <polyline
          key={i}
          points={path.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={penWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
