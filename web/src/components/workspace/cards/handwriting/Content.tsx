"use client";

import { useMemo, useRef } from "react";
import { parseHandwriting, serializeHandwriting } from "@/state/cardContent";
import { cardSurface } from "../_shared/surface";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import { useHandwriting } from "../_shared/blocks/useHandwriting";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Handwriting — SVG path 그리기. (레거시 단독 카드; 생성 경로는
 * FEAT-card-allinone에서 글 카드로 흡수됨. 드로잉 로직은
 * _shared/blocks/useHandwriting 훅 공유.)
 * 키보드: Esc commit / Cmd+Z undo / Cmd+Shift+Z redo /
 *         Cmd+Backspace clear / [ ] 펜 굵기 / E 지우개 토글.
 * ───────────────────────────────────────────────────────────── */

const HANDWRITING_HEIGHT = 220;

export function HandwritingCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const data = useMemo(() => parseHandwriting(card.content), [card.content]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hw = useHandwriting({
    paths: data.paths,
    editing,
    onPathsChange: (paths) => onChange(serializeHandwriting({ paths })),
    svgRef,
  });

  // FEAT-card-entry-mode §6: handwriting 자동 포커스 타겟 = [data-card-canvas] wrapper.
  useAutoFocusOnEdit(wrapperRef, editing);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onCommitEdit();
      return;
    }
    hw.handleDrawingKey(e);
  };

  const innerWidth = card.width;
  const drawCursor = hw.tool === "eraser" ? "cell" : "crosshair";

  return (
    <div
      ref={wrapperRef}
      tabIndex={editing ? 0 : -1}
      data-card-canvas
      onKeyDown={onKeyDown}
      className="rounded-[6px] overflow-hidden h-full flex flex-col outline-none relative"
      style={{ ...cardSurface("handwriting") }}
    >
      {/*
       * 콘텐츠 inset — handwriting PNG 종이 영역(상단 펜·우하단 펜 회피).
       * top 13% / left 1% / right 8% / bottom 9% (P0 측정값).
       */}
      <div
        className="absolute flex flex-col"
        style={{ top: "13%", left: "1%", right: "8%", bottom: "9%" }}
      >
        <div className="flex items-center justify-end gap-2 px-1 shrink-0">
          {editing && (
            <span
              className="text-[10px] text-text-soft select-none"
              aria-label={`pen ${hw.penWidth} ${hw.tool}`}
            >
              {hw.tool === "eraser" ? "지우개" : "펜"} · {hw.penWidth}
            </span>
          )}
          {editing && hw.hasPaths && (
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
        <svg
          ref={svgRef}
          width="100%"
          height={card.height !== undefined ? "100%" : HANDWRITING_HEIGHT}
          onPointerDown={hw.onPointerDown}
          onPointerMove={hw.onPointerMove}
          onPointerUp={hw.onPointerUp}
          onPointerCancel={hw.onPointerUp}
          onMouseDown={(e) => {
            // editing 중에만 드래그 시작을 차단 (그리기 입력 보호).
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
            <text
              x={innerWidth / 2}
              y={HANDWRITING_HEIGHT / 2}
              textAnchor="middle"
              fontSize="12"
              fill="var(--color-text-soft)"
            >
              ✎
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
