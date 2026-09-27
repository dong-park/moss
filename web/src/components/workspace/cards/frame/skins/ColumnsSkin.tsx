"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import {
  FRAME_COLUMN_COUNT_MAX,
  FRAME_COLUMN_COUNT_MIN,
  type FrameColumn,
} from "@/state/frameContent";
import { useT } from "@/i18n/Provider";

/* ─────────────────────────────────────────────────────────────
 * FEAT-frame-skins — 세로 칸 판의 배경 그림.
 * 판 폭을 N등분한 세로 경계 N−1개와, 칸마다 위쪽 이름표를 그린다(AC-5·AC-7).
 * 이름표·경계는 메모보다 아래층 배경이다 — 포인터를 잡는 것은 이름표와
 * "+"·지우기 버튼뿐이라 빈 곳 드래그로 판을 옮기는 동작은 그대로다.
 * 경계·이름표 크기는 CSS 변수(--frame-zoom)만으로 바뀐다(§8).
 * ───────────────────────────────────────────────────────────── */

/** 이름표 화면 하한 11px. 줌아웃해도 이보다 작아지지 않는다(AC-5). */
const LABEL_SCREEN_MIN_PX = 11;
const LABEL_FONT = `max(${LABEL_SCREEN_MIN_PX}px, calc(${LABEL_SCREEN_MIN_PX}px / var(--frame-zoom, 1)))`;

export function ColumnsSkin({
  frameId,
  columns,
}: {
  frameId: string;
  columns: FrameColumn[];
}) {
  const addFrameColumn = useWorkspace((s) => s.addFrameColumn);
  const renameFrameColumn = useWorkspace((s) => s.renameFrameColumn);
  const removeFrameColumn = useWorkspace((s) => s.removeFrameColumn);
  const t = useT();

  const n = columns.length;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId === null) return;
    const raf = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(raf);
  }, [editingId]);

  const startEditing = (column: FrameColumn) => {
    setDraft(column.name);
    setEditingId(column.id);
  };

  const commit = () => {
    if (editingId === null) return;
    renameFrameColumn(frameId, editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="pointer-events-none absolute inset-0" data-frame-columns="true">
      {/* 칸 경계 — 판 폭을 N등분한 자리의 옅은 세로선 N−1개. */}
      {Array.from({ length: n - 1 }, (_, i) => (
        <div
          key={`boundary-${i}`}
          aria-hidden="true"
          data-frame-column-boundary="true"
          className="absolute bottom-0 top-0 w-px opacity-60"
          style={{
            left: `${((i + 1) / n) * 100}%`,
            backgroundColor: "var(--color-border-strong)",
          }}
        />
      ))}

      {/* 칸 머리 — 판 이름표 아래 한 줄. */}
      <div className="absolute inset-x-0 flex" style={{ top: 34 }}>
        {columns.map((column, i) => {
          const isLast = i === n - 1;
          const editing = editingId === column.id;
          return (
            <div key={column.id} className="relative flex min-w-0 flex-1 justify-center">
              <div className="group/col pointer-events-auto inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5">
                {editing ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    maxLength={20}
                    aria-label={t("workspace.frameSkin.unnamedColumn")}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    className="min-w-0 bg-transparent text-center font-medium text-text outline-none"
                    style={{ fontSize: LABEL_FONT, width: "100%" }}
                  />
                ) : (
                  <span
                    data-frame-column-name="true"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditing(column);
                    }}
                    className={[
                      "min-w-0 cursor-text truncate rounded px-0.5 text-center font-medium",
                      column.name === "" ? "text-text-soft" : "text-text",
                    ].join(" ")}
                    style={{ fontSize: LABEL_FONT }}
                  >
                    {column.name === ""
                      ? t("workspace.frameSkin.unnamedColumn")
                      : column.name}
                  </span>
                )}
                {n > FRAME_COLUMN_COUNT_MIN && !editing && (
                  <button
                    type="button"
                    data-frame-column-remove="true"
                    aria-label={t("workspace.frameSkin.removeColumn")}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFrameColumn(frameId, column.id);
                    }}
                    className="shrink-0 cursor-pointer text-text-soft opacity-0 transition-opacity hover:text-text focus-visible:opacity-100 group-hover/col:opacity-100"
                    style={{ fontSize: LABEL_FONT }}
                  >
                    ×
                  </button>
                )}
              </div>
              {/* 마지막 칸 오른쪽의 "+" — 8개면 안 보인다(AC-6). */}
              {isLast && n < FRAME_COLUMN_COUNT_MAX && (
                <button
                  type="button"
                  data-frame-column-add="true"
                  aria-label={t("workspace.frameSkin.addColumn")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    addFrameColumn(frameId);
                  }}
                  className="pointer-events-auto absolute right-0 top-0 cursor-pointer rounded px-1 font-medium text-text-soft transition-colors hover:text-text"
                  style={{ fontSize: LABEL_FONT }}
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
