"use client";

import { useRef } from "react";
import type { HandwritingPoint } from "@/state/cardContent";
import { useHandwriting } from "./useHandwriting";

/* handwriting 블록 — 고정 높이 SVG 드로잉 영역. all-in-one 카드 안에 박힌다. */

const BLOCK_HEIGHT = 160;

export function HandwritingBlock({
  paths,
  editing,
  onChange,
  onCommitEdit,
}: {
  paths: HandwritingPoint[][];
  editing: boolean;
  onChange: (paths: HandwritingPoint[][]) => void;
  onCommitEdit: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hw = useHandwriting({ paths, editing, onPathsChange: onChange, svgRef });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onCommitEdit();
      return;
    }
    hw.handleDrawingKey(e);
  };

  const drawCursor = hw.tool === "eraser" ? "cell" : "crosshair";

  return (
    <div
      ref={wrapperRef}
      tabIndex={editing ? 0 : -1}
      data-card-canvas
      onKeyDown={onKeyDown}
      className="rounded-[4px] overflow-hidden outline-none flex flex-col"
      style={{ height: BLOCK_HEIGHT }}
    >
      {editing && (
        <div className="flex items-center justify-end gap-2 px-1 shrink-0">
          <span
            className="text-[10px] text-text-soft select-none"
            aria-label={`pen ${hw.penWidth} ${hw.tool}`}
          >
            {hw.tool === "eraser" ? "지우개" : "펜"} · {hw.penWidth}
          </span>
          {hw.hasPaths && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                hw.clearAll();
              }}
              className="cursor-pointer text-[10px] text-text-soft hover:text-text"
            >
              ✕
            </button>
          )}
        </div>
      )}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onPointerDown={hw.onPointerDown}
        onPointerMove={hw.onPointerMove}
        onPointerUp={hw.onPointerUp}
        onPointerCancel={hw.onPointerUp}
        onMouseDown={(e) => {
          if (editing) e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (editing) onCommitEdit();
        }}
        style={{
          display: "block",
          flex: 1,
          background: "rgba(0,0,0,0.02)",
          cursor: editing ? drawCursor : "default",
          touchAction: "none",
        }}
      >
        {hw.allPaths.map((path, i) => (
          <polyline
            key={i}
            points={path.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth={hw.penWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {!editing && !hw.hasPaths && (
          <text x="50%" y="50%" textAnchor="middle" fontSize="12" fill="var(--color-text-soft)">
            ✎
          </text>
        )}
      </svg>
    </div>
  );
}
