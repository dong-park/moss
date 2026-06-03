"use client";

import { useCallback, useState, type RefObject } from "react";
import type { HandwritingPoint } from "@/state/cardContent";
import {
  useDrawing,
  PEN_MIN_WIDTH,
  PEN_MAX_WIDTH,
  PEN_DEFAULT_WIDTH,
  type DrawingTool,
} from "../useDrawing";

/* ─────────────────────────────────────────────────────────────
 * 손글씨 드로잉 로직 (hook) — handwriting 카드와 handwriting 블록이 공유.
 * 그리기 코어(toLocal/finishStroke/pathsIntersect/draft)는 단일 엔진
 * [[useDrawing]]에 위임하고, 여기서는 그 위에 handwriting 전용 레이어만 얹는다:
 *  - penWidth/tool 내부 상태(메모 overlay는 보드 전역, 여기는 컴포넌트 로컬).
 *  - undo/redo/clear + 키보드 단축키.
 * 좌표는 svgRef 기준 로컬. paths/onPathsChange로 소유권을 호출부에 둔다
 * (카드 = serializeHandwriting, 블록 = 블록 배열 갱신).
 *
 * 키: Cmd+Z undo / Cmd+Shift+Z redo / Cmd+Backspace clear /
 *     [ ] 펜 굵기 / E 지우개 토글. Esc(=commit)는 호출부 책임.
 * ───────────────────────────────────────────────────────────── */

// 펜 굵기 상수는 [[useDrawing]]이 단일 소스. 기존 import 경로 호환을 위해 재노출한다.
export {
  PEN_MIN_WIDTH as PEN_MIN,
  PEN_MAX_WIDTH as PEN_MAX,
  PEN_DEFAULT_WIDTH as PEN_DEFAULT,
};

export interface UseHandwriting {
  penWidth: number;
  tool: DrawingTool;
  /** 확정 path + 그리는 중 draft(pen일 때만) — 렌더용. */
  allPaths: HandwritingPoint[][];
  hasPaths: boolean;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  /** undo/redo/clear/펜굵기/지우개 키 처리. 처리했으면 true (Esc는 다루지 않음). */
  handleDrawingKey: (e: React.KeyboardEvent) => boolean;
  clearAll: () => void;
}

export function useHandwriting({
  paths,
  editing,
  onPathsChange,
  svgRef,
}: {
  paths: HandwritingPoint[][];
  editing: boolean;
  onPathsChange: (paths: HandwritingPoint[][]) => void;
  /** 컴포넌트가 소유하는 SVG ref (hook이 ref를 반환하지 않도록 외부 주입). */
  svgRef: RefObject<SVGSVGElement | null>;
}): UseHandwriting {
  const [penWidth, setPenWidth] = useState<number>(PEN_DEFAULT_WIDTH);
  const [tool, setTool] = useState<DrawingTool>("pen");
  // redo 스택은 content 밖 컴포넌트 state로만 보존. 새 stroke 그리면 비움.
  // 값은 updater(prev) 안에서만 읽으므로 setter만 구독한다.
  const [, setRedoStack] = useState<HandwritingPoint[][]>([]);

  // 그리기 코어는 단일 엔진에 위임. 새 stroke/지우개로 paths가 바뀌면 redo를 비운다
  // (onPathsChange는 finishStroke에서만 호출되므로 새 입력=redo 무효 조건과 일치).
  const drawing = useDrawing({
    paths,
    active: editing,
    tool,
    onPathsChange: (next) => {
      onPathsChange(next);
      setRedoStack([]);
    },
    svgRef,
  });

  const clearAll = useCallback(() => {
    if (paths.length === 0) return;
    onPathsChange([]);
    setRedoStack([]);
  }, [paths, onPathsChange]);

  const undo = useCallback(() => {
    if (paths.length === 0) return;
    const last = paths[paths.length - 1];
    onPathsChange(paths.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  }, [paths, onPathsChange]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onPathsChange([...paths, last]);
      return prev.slice(0, -1);
    });
  }, [paths, onPathsChange]);

  const handleDrawingKey = (e: React.KeyboardEvent): boolean => {
    if (!editing) return false;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return true;
    }
    if (mod && e.key === "Backspace") {
      e.preventDefault();
      clearAll();
      return true;
    }
    if (e.key === "[") {
      e.preventDefault();
      setPenWidth((w) => Math.max(PEN_MIN_WIDTH, +(w - 1).toFixed(1)));
      return true;
    }
    if (e.key === "]") {
      e.preventDefault();
      setPenWidth((w) => Math.min(PEN_MAX_WIDTH, +(w + 1).toFixed(1)));
      return true;
    }
    if (!mod && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      setTool((tl) => (tl === "pen" ? "eraser" : "pen"));
      return true;
    }
    return false;
  };

  return {
    penWidth,
    tool,
    allPaths: drawing.allPaths,
    hasPaths: paths.length > 0,
    onPointerDown: drawing.onPointerDown,
    onPointerMove: drawing.onPointerMove,
    onPointerUp: drawing.onPointerUp,
    handleDrawingKey,
    clearAll,
  };
}
