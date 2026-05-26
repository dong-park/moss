"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import type { HandwritingPoint } from "@/state/cardContent";

/* ─────────────────────────────────────────────────────────────
 * 손글씨 드로잉 로직 (hook) — handwriting 카드와 handwriting 블록이 공유.
 * SVG path 입력 + 펜/지우개 + undo/redo/clear/굵기.
 * 좌표는 svgRef 기준 로컬. paths/onPathsChange로 소유권을 호출부에 둔다
 * (카드 = serializeHandwriting, 블록 = 블록 배열 갱신).
 *
 * 키: Cmd+Z undo / Cmd+Shift+Z redo / Cmd+Backspace clear /
 *     [ ] 펜 굵기 / E 지우개 토글. Esc(=commit)는 호출부 책임.
 * ───────────────────────────────────────────────────────────── */

export const PEN_MIN = 1;
export const PEN_MAX = 12;
export const PEN_DEFAULT = 1.5;

/** path A·B가 시각적으로 교차하는지 간이 판정 — 점 단위 근접 검사. */
export function pathsIntersect(a: HandwritingPoint[], b: HandwritingPoint[]): boolean {
  const threshold = 8; // px
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

export interface UseHandwriting {
  penWidth: number;
  tool: "pen" | "eraser";
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
  const [draft, setDraft] = useState<HandwritingPoint[]>([]);
  const [penWidth, setPenWidth] = useState<number>(PEN_DEFAULT);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  // redo 스택은 content 밖 컴포넌트 state로만 보존. 새 stroke 그리면 비움.
  // 값은 updater(prev) 안에서만 읽으므로 setter만 구독한다.
  const [, setRedoStack] = useState<HandwritingPoint[][]>([]);
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
    if (!editing) return;
    e.stopPropagation();
    e.preventDefault();
    drawingRef.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    setDraft([toLocal(e.clientX, e.clientY)]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editing || !drawingRef.current) return;
    setDraft((prev) => [...prev, toLocal(e.clientX, e.clientY)]);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDraft((cur) => {
      if (cur.length > 1) {
        if (tool === "eraser") {
          const next = paths.filter((path) => !pathsIntersect(path, cur));
          if (next.length !== paths.length) {
            onPathsChange(next);
            setRedoStack([]);
          }
        } else {
          onPathsChange([...paths, cur]);
          setRedoStack([]);
        }
      }
      return [];
    });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editing) return;
    e.stopPropagation();
    finishStroke();
  };

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
      setPenWidth((w) => Math.max(PEN_MIN, +(w - 1).toFixed(1)));
      return true;
    }
    if (e.key === "]") {
      e.preventDefault();
      setPenWidth((w) => Math.min(PEN_MAX, +(w + 1).toFixed(1)));
      return true;
    }
    if (!mod && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      setTool((tl) => (tl === "pen" ? "eraser" : "pen"));
      return true;
    }
    return false;
  };

  const allPaths =
    draft.length > 1 && tool === "pen" ? [...paths, draft] : paths;

  return {
    penWidth,
    tool,
    allPaths,
    hasPaths: paths.length > 0,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    handleDrawingKey,
    clearAll,
  };
}
