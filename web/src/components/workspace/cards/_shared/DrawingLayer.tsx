"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-markdown-memo-pen — 공유 그리기 레이어.
 *
 * handwriting 카드의 SVG 펜/지우개 로직을 추출해 두 곳이 공용한다:
 *  (1) handwriting 카드 본문
 *  (2) 펜 모드의 메모 카드 overlay (T-5)
 *
 * 책임 분리:
 *  - DrawingLayer = 포인터→stroke 그리기 + 지우개 + 렌더. value(직렬화 paths)가 source.
 *  - undo/redo/clear/굵기·도구 토글 = 호출측이 소유(카드 키보드 or 펜 모드 전역).
 *
 * active=false면 pointer-events:none → 클릭이 카드(드래그/편집)로 통과한다.
 * 좌표는 svg(=카드 content box) 기준 상대좌표(handwriting과 동일, 리사이즈 비스케일).
 *
 * viewBox(선택): 지정 시 SVG는 viewBox="0 0 W H" + preserveAspectRatio
 * "xMinYMin meet"로 비율 유지하며 컨테이너에 맞춰 확대된다. 새 stroke의 좌표는
 * toLocal에서 픽셀→viewBox 좌표로 환산돼 기존 stroke와 좌표공간이 일치한다
 * — 카드(viewBox 없음)와 모달(viewBox=카드크기) 사이 동일 데이터로 호환된다.
 * ───────────────────────────────────────────────────────────── */

import { useMemo, useRef, useState } from "react";
import {
  parseHandwriting,
  serializeHandwriting,
  type HandwritingPoint,
} from "@/state/cardContent";

export type DrawingTool = "pen" | "eraser";

export type DrawingLayerProps = {
  value: string;
  active: boolean;
  penWidth: number;
  tool: DrawingTool;
  onChange: (json: string) => void;
  /** stroke 색 (CSS 변수). 기본 본문색. */
  stroke?: string;
  /**
   * SVG viewBox 좌표계 크기. 지정 시 비율 유지하며 컨테이너에 맞춰 확대된다.
   * 미지정 시 1:1 픽셀 좌표(카드 본문 — 기존 동작). 자세한 설명은 파일 헤더.
   */
  viewBox?: { width: number; height: number };
};

/** 지우개 근접 판정 임계 (px). */
const ERASER_THRESHOLD = 8;

export function DrawingLayer({
  value,
  active,
  penWidth,
  tool,
  onChange,
  stroke = "var(--color-text)",
  viewBox,
}: DrawingLayerProps) {
  const data = useMemo(() => parseHandwriting(value), [value]);
  const [draft, setDraft] = useState<HandwritingPoint[]>([]);
  const drawingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const toLocal = (clientX: number, clientY: number): HandwritingPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    // viewBox 사용 시 픽셀→viewBox 좌표 환산. xMinYMin meet → 좌상단 anchor,
    // scale = min(W/vbW, H/vbH), offset 없음.
    if (viewBox && rect.width > 0 && rect.height > 0) {
      const s = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
      if (s > 0) {
        return {
          x: +((clientX - rect.left) / s).toFixed(1),
          y: +((clientY - rect.top) / s).toFixed(1),
        };
      }
    }
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
    // onChange는 부모 store(setOverlay)를 갱신하므로 반드시 이벤트 핸들러 본문에서
    // 호출한다. setDraft 업데이터 안에서 부르면 render 단계의 cross-component
    // setState가 되어 "Cannot update a component while rendering" 경고가 난다.
    if (draft.length > 1) {
      if (tool === "eraser") {
        const next = data.paths.filter((path) => !pathsIntersect(path, draft));
        if (next.length !== data.paths.length) {
          onChange(serializeHandwriting({ paths: next }));
        }
      } else {
        onChange(serializeHandwriting({ paths: [...data.paths, draft] }));
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
    draft.length > 1 && tool === "pen" ? [...data.paths, draft] : data.paths;
  const cursor = active ? (tool === "eraser" ? "cell" : "crosshair") : "default";

  return (
    <svg
      ref={svgRef}
      data-drawing-layer
      viewBox={viewBox ? `0 0 ${viewBox.width} ${viewBox.height}` : undefined}
      preserveAspectRatio={viewBox ? "xMinYMin meet" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
      }}
    >
      {allPaths.map((path, i) => (
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

/** path A·B가 시각적으로 교차하는지 간이 판정 — 점 단위 근접 검사. */
function pathsIntersect(a: HandwritingPoint[], b: HandwritingPoint[]): boolean {
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
