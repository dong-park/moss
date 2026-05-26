"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { parseHandwriting, serializeHandwriting } from "@/state/cardContent";
import { cardSurface } from "../_shared/surface";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import { DrawingLayer } from "../_shared/DrawingLayer";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Handwriting — SVG path 그리기. 그리기 표면은 공유 DrawingLayer로 위임하고,
 * 카드는 키보드(undo/redo/clear/굵기/지우개 토글)·도구 상태·툴바만 소유한다.
 * (FEAT-markdown-memo-pen T-4: 펜 모드 overlay와 그리기 로직 공용화)
 * 키보드: Esc commit / Cmd+Z undo / Cmd+Shift+Z redo /
 *         Cmd+Backspace clear / [ ] 펜 굵기 / E 지우개 토글.
 * ───────────────────────────────────────────────────────────── */

const PEN_MIN = 1;
const PEN_MAX = 12;
const PEN_DEFAULT = 1.5;

export function HandwritingCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const data = useMemo(() => parseHandwriting(card.content), [card.content]);
  const [penWidth, setPenWidth] = useState<number>(PEN_DEFAULT);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  // redo 스택은 카드 content 밖, 컴포넌트 state로만 보존(표준 undo/redo 시맨틱).
  // 값은 setter 콜백(prev)으로만 접근하므로 바인딩은 setter만 둔다.
  const [, setRedoStack] = useState<typeof data.paths>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // DrawingLayer가 새 stroke/지우개를 반영할 때 — redo 스택을 비운다.
  const onLayerChange = useCallback(
    (json: string) => {
      onChange(json);
      setRedoStack([]);
    },
    [onChange],
  );

  const clearAll = useCallback(() => {
    if (data.paths.length === 0) return;
    onChange(serializeHandwriting({ paths: [] }));
    setRedoStack([]);
  }, [data.paths, onChange]);

  const undo = useCallback(() => {
    if (data.paths.length === 0) return;
    const last = data.paths[data.paths.length - 1];
    onChange(serializeHandwriting({ paths: data.paths.slice(0, -1) }));
    setRedoStack((prev) => [...prev, last]);
  }, [data.paths, onChange]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onChange(serializeHandwriting({ paths: [...data.paths, last] }));
      return prev.slice(0, -1);
    });
  }, [data.paths, onChange]);

  // FEAT-card-entry-mode §6: 자동 포커스 타겟 = [data-card-canvas] wrapper.
  useAutoFocusOnEdit(wrapperRef, editing);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      e.preventDefault();
      onCommitEdit();
      return;
    }
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key === "Backspace") {
      e.preventDefault();
      clearAll();
      return;
    }
    if (e.key === "[") {
      e.preventDefault();
      setPenWidth((w) => Math.max(PEN_MIN, +(w - 1).toFixed(1)));
      return;
    }
    if (e.key === "]") {
      e.preventDefault();
      setPenWidth((w) => Math.min(PEN_MAX, +(w + 1).toFixed(1)));
      return;
    }
    if (!mod && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      setTool((t) => (t === "pen" ? "eraser" : "pen"));
      return;
    }
  };

  const isEmpty = data.paths.length === 0;

  return (
    <div
      ref={wrapperRef}
      tabIndex={editing ? 0 : -1}
      data-card-canvas
      onKeyDown={onKeyDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (editing) onCommitEdit();
      }}
      className="rounded-[6px] overflow-hidden h-full flex flex-col outline-none relative"
      style={{ ...cardSurface("handwriting") }}
    >
      {/* 콘텐츠 inset — handwriting PNG 종이 영역(상단/우하단 펜 회피). */}
      <div
        className="absolute flex flex-col"
        style={{ top: "13%", left: "1%", right: "8%", bottom: "9%" }}
      >
        <div className="flex items-center justify-end gap-2 px-1 shrink-0">
          {editing && (
            <span
              className="text-[10px] text-text-soft select-none"
              aria-label={`pen ${penWidth} ${tool}`}
            >
              {tool === "eraser" ? "지우개" : "펜"} · {penWidth}
            </span>
          )}
          {editing && !isEmpty && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="cursor-pointer text-[10px] text-text-soft hover:text-text"
            >
              ✕
            </button>
          )}
        </div>
        <div
          className="relative flex-1"
          style={{ background: "rgba(0,0,0,0.02)" }}
        >
          <DrawingLayer
            value={card.content}
            active={editing}
            penWidth={penWidth}
            tool={tool}
            onChange={onLayerChange}
          />
          {!editing && isEmpty && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-text-soft">
              ✎
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
