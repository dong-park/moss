"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  useMemoTable,
  frameNameMap,
  SYSTEM_BOARD_KEY,
} from "@/state/memoTable";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-table-view — 표 툴바: 검색·보드/메모판/첨부 필터.
 * 뷰 상태는 세션 메모리(state/memoTable)만 쓴다(spec §2 제외).
 * ───────────────────────────────────────────────────────────── */

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function MemoTableToolbar() {
  const t = useT();
  const notes = useMemoTable((s) => s.notes);
  const boards = useMemoTable((s) => s.boards);
  const boardFilter = useMemoTable((s) => s.boardFilter);
  const includeSubboards = useMemoTable((s) => s.includeSubboards);
  const frameFilter = useMemoTable((s) => s.frameFilter);
  const hasAttachment = useMemoTable((s) => s.hasAttachment);
  const query = useMemoTable((s) => s.query);
  const setBoardFilter = useMemoTable((s) => s.setBoardFilter);
  const setIncludeSubboards = useMemoTable((s) => s.setIncludeSubboards);
  const setFrameFilter = useMemoTable((s) => s.setFrameFilter);
  const setHasAttachment = useMemoTable((s) => s.setHasAttachment);
  const setQuery = useMemoTable((s) => s.setQuery);

  // 검색은 150ms 디바운스 — 키 입력마다 파생을 다시 돌리지 않는다(P1-6).
  const [queryInput, setQueryInput] = useState(query);
  useEffect(() => {
    if (queryInput === query) return;
    const id = window.setTimeout(() => setQuery(queryInput), 150);
    return () => window.clearTimeout(id);
  }, [queryInput, query, setQuery]);

  const frames = useMemo(() => {
    const names = frameNameMap(notes);
    return [...names.entries()].map(([id, name]) => ({ id, name }));
  }, [notes]);

  const boardOptions = [
    { key: SYSTEM_BOARD_KEY, label: t("workspace.boardPicker.system") },
    ...boards.map((b) => ({
      key: b.id,
      label: b.name || t("workspace.boardPicker.unnamed"),
    })),
  ];
  const selectedBoards = boardFilter === "all" ? null : boardFilter;

  // pr-28: 우상단 고정 ViewToggle과 겹치지 않도록 오른쪽 여백을 비운다.
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border py-2 pl-3 pr-28">
      <input
        type="search"
        value={queryInput}
        onChange={(e) => setQueryInput(e.target.value)}
        placeholder={t("workspace.table.search.placeholder")}
        aria-label={t("workspace.table.search.placeholder")}
        className="w-56 rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-text outline-none focus:border-accent-blue"
      />

      {/* 보드 필터 — "모든 보드" 또는 다중 선택 + 하위 함 포함 */}
      <details className="relative" data-testid="table-board-filter">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-text-soft hover:bg-panel">
          {t("workspace.table.filter.board")}
          {selectedBoards && (
            <span className="rounded bg-accent-lime/30 px-1 text-[10px] text-text">
              {selectedBoards.length}
            </span>
          )}
        </summary>
        <div className="absolute left-0 top-full z-[var(--z-panel)] mt-1 w-56 rounded-md border border-border bg-bg p-2 shadow-card">
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-text hover:bg-panel">
            <input
              type="radio"
              name="board-filter-mode"
              checked={boardFilter === "all"}
              onChange={() => setBoardFilter("all")}
            />
            {t("workspace.table.filter.allBoards")}
          </label>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-56 overflow-auto">
            {boardOptions.map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-text hover:bg-panel"
              >
                <input
                  type="checkbox"
                  checked={selectedBoards?.includes(opt.key) ?? false}
                  onChange={() => {
                    const current = selectedBoards ?? [];
                    const next = toggleIn(current, opt.key);
                    setBoardFilter(next.length > 0 ? next : "all");
                  }}
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
          <div className="my-1 h-px bg-border" />
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-text hover:bg-panel">
            <input
              type="checkbox"
              checked={includeSubboards}
              onChange={(e) => setIncludeSubboards(e.target.checked)}
            />
            {t("workspace.table.filter.includeSubboards")}
          </label>
        </div>
      </details>

      {/* 메모판 필터 — 다중 선택 */}
      <details className="relative" data-testid="table-frame-filter">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-text-soft hover:bg-panel">
          {t("workspace.table.filter.frame")}
          {frameFilter && (
            <span className="rounded bg-accent-lime/30 px-1 text-[10px] text-text">
              {frameFilter.length}
            </span>
          )}
        </summary>
        <div className="absolute left-0 top-full z-[var(--z-panel)] mt-1 w-56 rounded-md border border-border bg-bg p-2 shadow-card">
          <button
            type="button"
            onClick={() => setFrameFilter(null)}
            className={`w-full cursor-pointer rounded px-1 py-1 text-left text-xs hover:bg-panel ${
              frameFilter === null ? "text-text" : "text-text-soft"
            }`}
          >
            {t("workspace.table.filter.allFrames")}
          </button>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-56 overflow-auto">
            {frames.length === 0 && (
              <p className="px-1 py-1 text-xs text-text-muted">—</p>
            )}
            {frames.map((f) => (
              <label
                key={f.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-text hover:bg-panel"
              >
                <input
                  type="checkbox"
                  checked={frameFilter?.includes(f.id) ?? false}
                  onChange={() =>
                    setFrameFilter(
                      toggleIn(frameFilter ?? [], f.id),
                    )
                  }
                />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
        </div>
      </details>

      {/* 첨부 필터 */}
      <select
        value={hasAttachment === null ? "all" : hasAttachment ? "has" : "none"}
        onChange={(e) => {
          const v = e.target.value;
          setHasAttachment(v === "all" ? null : v === "has");
        }}
        aria-label={t("workspace.table.filter.attachment")}
        className="cursor-pointer rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-soft outline-none"
      >
        <option value="all">
          {t("workspace.table.filter.attachment")} ·{" "}
          {t("workspace.table.filter.attachmentAll")}
        </option>
        <option value="has">
          {t("workspace.table.filter.attachment")} ·{" "}
          {t("workspace.table.filter.attachmentHas")}
        </option>
        <option value="none">
          {t("workspace.table.filter.attachment")} ·{" "}
          {t("workspace.table.filter.attachmentNone")}
        </option>
      </select>
    </div>
  );
}
