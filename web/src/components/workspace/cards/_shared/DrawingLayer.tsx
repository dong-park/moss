"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-markdown-memo-pen / FEAT-pen-drawing-engine — 공유 그리기 레이어.
 *
 * 메모 카드 overlay(text/Content) + 펼침 모달(MemoExpandDialog)이 공용하는
 * 렌더 컴포넌트. 그리기 코어(toLocal/finishStroke/eraseArea/draft)는 단일 엔진
 * [[useDrawing]]에 있고, 여기는 그 얇은 호출부다:
 *  - value(직렬화 획) ↔ onChange(json)만 책임지고 나머지는 엔진에 위임.
 *  - 획은 [[parseStrokes]]/[[serializeStrokes]]로 읽고 쓴다 — 색·굵기 이름이 지우개와
 *    덧그리기를 거쳐도 유지된다. 옛 획(색·굵기 없음)은 검정·가는 선으로 읽힌다.
 *  - undo/redo/clear/굵기·도구 토글 = 호출측 소유(펜 모드 전역).
 *
 * active=false면 pointer-events:none → 클릭이 카드(드래그/편집)로 통과한다.
 *
 * 좌표계: 기본은 부모 컬럼(고정 폭 [[MEMO_CONTENT_WIDTH]])을 가득 채우는 1:1 픽셀 좌표.
 * 카드와 모달이 같은 고정 폭 컬럼 위에 이 레이어를 1:1로 얹으므로, stroke가 카드↔
 * 모달 어디서 그려져도 동일 좌표공간에 저장되고 같은 글자 위에 정렬된다(viewBox 없음).
 * 기운 포스트잇처럼 화면 좌표가 자기 좌표와 다르면 `toLocal`을 주입한다.
 * Mobile may scale the whole column; coordinateWidth maps input back to these
 * canonical pixels without changing text wrapping or the serialized paths.
 * ───────────────────────────────────────────────────────────── */

import { useImperativeHandle, useMemo, useRef, type Ref } from "react";
import {
  identifyStrokes,
  parseStrokes,
  serializeStrokes,
  type HandwritingPoint,
  type HandwritingStroke,
} from "@/state/cardContent";
import {
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_WIDTH,
  markerColorValue,
  markerWidthUnits,
  type MarkerColor,
  type MarkerWidth,
} from "@/state/marker/tokens";
import { clipStrokeToBox } from "./stickyGeometry";
import {
  newPieceId,
  useDrawing,
  type DrawingStroke,
  type DrawingTool,
  type EraseResult,
  type NewDrawingStroke,
} from "./useDrawing";

export type { DrawingTool };

/** 호출측이 포인터를 직접 넘겨 줄 때 쓰는 손잡이(D5 — 안 들고 펜으로 그을 때). */
export interface DrawingLayerHandle {
  onPointerDown: (e: React.PointerEvent<Element>) => void;
}

export type DrawingLayerProps = {
  value: string;
  active: boolean;
  /**
   * 기본 굵기(`thin`) 획을 그릴 두께. 옛 메모 펜은 호출측이 정한 한 굵기로 모든 획을
   * 그렸으므로, 그 획이 "원래 굵기"로 보이게 이 값을 쓴다. 생략하면 토큰 표를 따른다.
   * `mid`·`thick` 획은 항상 토큰 표(보드 단위)를 따른다.
   */
  penWidth?: number;
  tool: DrawingTool;
  onChange: (json: string) => void;
  /**
   * 검정 잉크의 화면 색(CSS 변수 가능). 기본 본문색 — 재질이 바뀌어도 검정은 글자색을 따른다.
   * 다른 색 이름은 토큰 표의 값으로 그린다.
   */
  stroke?: string;
  /** 새 획의 색 이름. 기본 검정. */
  color?: MarkerColor;
  /** 새 획의 굵기 이름. 기본 가는 선. */
  width?: MarkerWidth;
  /** 화면 좌표 → 저장 좌표. 생략하면 이 레이어 박스 기준 1:1 상대 픽셀. */
  toLocal?: (clientX: number, clientY: number) => HandwritingPoint;
  /** 천이 닿는 반경(저장 좌표 단위). */
  eraserRadius?: number;
  /** 그리던 획을 버렸다(두 번째 손가락이 닿음). */
  onCancel?: () => void;
  /**
   * D5: 아무것도 안 들었어도(active=false) 태블릿 펜은 그린다. 이 레이어가
   * pointer-events:none이면 호출측이 `handleRef.onPointerDown`으로 펜의 pointerdown을 넘긴다.
   */
  acceptPen?: boolean;
  handleRef?: Ref<DrawingLayerHandle>;
  /**
   * 이 박스 밖은 그리지도 저장하지도 않는다(D4=A — 포스트잇 가장자리에서 잘림).
   * `true`면 보이는 것만 자르고, 크기를 주면 저장되는 획도 그 크기(0,0~w,h)로 자른다.
   */
  clip?: boolean | { width: number; height: number };
  /** 레이어 커서. 기본은 도구에 따른 십자/셀. `inherit`이면 벽의 마카·천 포인터를 물려받는다. */
  cursor?: string;
  coordinateWidth?: number;
};

function inkColor(color: MarkerColor, ink: string): string {
  return color === DEFAULT_MARKER_COLOR ? ink : markerColorValue(color);
}

function strokeWidth(width: MarkerWidth, penWidth: number | undefined): number {
  return width === DEFAULT_MARKER_WIDTH && penWidth !== undefined
    ? penWidth
    : markerWidthUnits(width);
}

/**
 * 지우기 결과를 overlay 획 배열에 적용한다. id는 획의 id다(옛 획은 내용에서 만든 id).
 * 색·굵기는 조각이 원본에서 이어받은 값 그대로 남고, 조각은 새 id를 받는다.
 */
function applyErase(
  current: readonly HandwritingStroke[],
  result: EraseResult,
): HandwritingStroke[] {
  const removed = new Set(result.removedIds);
  const kept = current.filter((s) => !(s.id && removed.has(s.id)));
  const pieces = result.added.map(({ id, points, color, width }) => ({ id, points, color, width }));
  return [...kept, ...pieces];
}

export function DrawingLayer({
  value,
  active,
  penWidth,
  tool,
  onChange,
  coordinateWidth,
  stroke = "var(--color-text)",
  color = DEFAULT_MARKER_COLOR,
  width = DEFAULT_MARKER_WIDTH,
  toLocal,
  eraserRadius,
  onCancel,
  acceptPen,
  handleRef,
  clip,
  cursor: cursorProp,
}: DrawingLayerProps) {
  const strokes = useMemo(() => identifyStrokes(parseStrokes(value)), [value]);
  const drawable = useMemo<DrawingStroke[]>(
    () => strokes.map((s) => ({ ...s, id: s.id })),
    [strokes],
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawing = useDrawing({
    strokes: drawable,
    active,
    tool,
    color,
    width,
    eraserRadius,
    toLocal,
    acceptPen,
    onCommit: (next: NewDrawingStroke) => {
      if (typeof clip === "object") {
        // 박스 밖은 저장하지 않는다. 나갔다 들어오면 조각이 여럿 — 한 번에 한 번만 쓴다.
        const pieces = clipStrokeToBox(next.points, clip.width, clip.height);
        if (pieces.length === 0) return;
        onChange(
          serializeStrokes([
            ...strokes,
            ...pieces.map((points) => ({ ...next, id: newPieceId(), points })),
          ]),
        );
        return;
      }
      onChange(serializeStrokes([...strokes, { ...next, id: newPieceId() }]));
    },
    onErase: (result) => onChange(serializeStrokes(applyErase(strokes, result))),
    onCancel,
    svgRef,
    coordinateWidth,
  });

  useImperativeHandle(handleRef, () => ({
    onPointerDown: drawing.onPointerDown as DrawingLayerHandle["onPointerDown"],
  }));

  const cursor =
    cursorProp ?? (active ? (tool === "eraser" ? "cell" : "crosshair") : "default");
  // 펜으로 그리는 중인 획만 미리 보인다 — 천의 draft는 문지른 경로일 뿐 획이 아니다.
  const draftPoints = tool === "pen" && drawing.draft.length >= 1 ? drawing.draft : null;

  return (
    <svg
      ref={svgRef}
      data-drawing-layer
      onPointerDown={drawing.onPointerDown}
      onPointerMove={drawing.onPointerMove}
      onPointerUp={drawing.onPointerUp}
      onPointerCancel={drawing.onPointerCancel}
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
        // 컬럼 밖으로 나간 stroke도 모달에선 다 보이게. 포스트잇 위에서는 clip으로
        // 가장자리에서 자른다(D4=A) — 카드가 overflow:visible인 얼굴 카드도 포함.
        overflow: clip ? "hidden" : "visible",
      }}
    >
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={inkColor(s.color, stroke)}
          strokeWidth={strokeWidth(s.width, penWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {draftPoints && (
        <polyline
          data-drawing-draft
          points={draftPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={inkColor(color, stroke)}
          strokeWidth={strokeWidth(width, penWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
