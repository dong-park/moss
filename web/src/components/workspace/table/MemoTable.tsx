"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import {
  useMemoTable,
  buildMemoRows,
  deriveFromBase,
  type MemoRow,
  type MemoSortKey,
} from "@/state/memoTable";
import { memoTint } from "../memoVariety";
import { MemoTableToolbar } from "./MemoTableToolbar";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-table-view — 전체 메모 표 본체(spec §6·§7·§8).
 *
 *  - 컬럼: 선택·색·제목·본문 미리보기·보드(경로)·메모판·첨부 배지·만든 날·고친 날
 *  - 행 높이 36px, 헤더 고정, 1,000행 대비 고정높이 윈도 가상화(§6·§7)
 *  - 제목 셀 인라인 편집(setTitle/commitTitle 재사용, AC-5)
 *  - 행 클릭 → 메모창(openMemo) · hover "캔버스에서 보기"(openCardOnCanvas, AC-6)
 *  - 다중 선택 + Shift 범위 → 휴지통으로(AC-7)
 *  - 접근성: role="grid", 방향키 이동, Space 선택, Enter 메모창(§8)
 * ───────────────────────────────────────────────────────────── */

const ROW_H = 36;
const OVERSCAN = 8;
const MIN_WIDTH = 1080;
const COLS =
  "36px 32px minmax(160px,1.4fr) minmax(220px,2fr) 170px 130px 96px 110px 110px";

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: COLS,
  minWidth: MIN_WIDTH,
};

const BADGE_ORDER: { key: keyof MemoRow["badgeCounts"]; icon: string }[] = [
  { key: "image", icon: "🖼️" },
  { key: "link", icon: "🔗" },
  { key: "audio", icon: "🎙️" },
  { key: "file", icon: "📎" },
];

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function MemoTable() {
  const t = useT();
  const notes = useMemoTable((s) => s.notes);
  const boards = useMemoTable((s) => s.boards);
  const sort = useMemoTable((s) => s.sort);
  const boardFilter = useMemoTable((s) => s.boardFilter);
  const includeSubboards = useMemoTable((s) => s.includeSubboards);
  const frameFilter = useMemoTable((s) => s.frameFilter);
  const hasAttachment = useMemoTable((s) => s.hasAttachment);
  const query = useMemoTable((s) => s.query);
  const selectedIds = useMemoTable((s) => s.selectedIds);
  const ensureLoaded = useMemoTable((s) => s.ensureLoaded);
  const setSort = useMemoTable((s) => s.setSort);
  const toggleSelected = useMemoTable((s) => s.toggleSelected);
  const setSelectedIds = useMemoTable((s) => s.setSelectedIds);
  const clearSelection = useMemoTable((s) => s.clearSelection);
  const setTitle = useMemoTable((s) => s.setTitle);
  const beginTitleEdit = useMemoTable((s) => s.beginTitleEdit);
  const commitTitle = useMemoTable((s) => s.commitTitle);
  const cancelTitleEdit = useMemoTable((s) => s.cancelTitleEdit);
  const trashSelected = useMemoTable((s) => s.trashSelected);
  const openMemo = useMemoTable((s) => s.openMemo);
  const openCardOnCanvas = useWorkspace((s) => s.openCardOnCanvas);
  const expandedCardId = useWorkspace((s) => s.expandedCardId);

  useEffect(() => {
    void ensureLoaded();
    // 표 언마운트 시 liveSync 구독·디바운스 타이머 해제(P1-5).
    return () => useMemoTable.getState().dispose();
  }, [ensureLoaded]);

  // 메모창이 닫힐 때 같은 탭(캔버스·메모창) 편집을 표에 재반영한다(P1-4).
  // 같은 탭 변경은 BroadcastChannel 자기 발신 무시 때문에 표에 알림이 안 온다.
  const prevExpandedRef = useRef<string | null>(expandedCardId);
  useEffect(() => {
    const prev = prevExpandedRef.current;
    prevExpandedRef.current = expandedCardId;
    if (prev !== null && expandedCardId === null) {
      void useMemoTable.getState().reload();
    }
  }, [expandedCardId]);

  // 기본 행(notes·boards 파생)은 여기에만 메모 — 검색 키 입력마다 5,000행을
  // 재생성하지 않는다(P1-6). 필터·검색·정렬은 그 위에서 파생한다.
  const baseRows = useMemo(
    () => buildMemoRows(notes, boards, t("workspace.boardPicker.system")),
    [notes, boards, t],
  );
  const filters = useMemo(
    () => ({ boardFilter, includeSubboards, frameFilter, hasAttachment, query }),
    [boardFilter, includeSubboards, frameFilter, hasAttachment, query],
  );
  const rows = useMemo(
    () => deriveFromBase(baseRows, boards, filters, sort),
    [baseRows, boards, filters, sort],
  );

  /* ─ 가상화: 고정 행 높이 윈도. jsdom처럼 높이 0이면 전체 렌더(테스트 친화). ─ */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const renderAll = viewportH <= 0;
  const start = renderAll ? 0 : Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const count = renderAll
    ? rows.length
    : Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const end = Math.min(rows.length, start + count);
  const visible = rows.slice(start, end);

  /* ─ 인라인 제목 편집 ─ */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");

  const beginEdit = (row: MemoRow) => {
    setEditingId(row.id);
    setDraft(row.title);
    draftRef.current = row.title;
    // 스토어가 원값을 기억해야 reload가 DB값으로 덮어도 입력이 보존된다(P1-1).
    beginTitleEdit(row.id, row.title);
  };
  const finishEdit = () => {
    const id = editingId;
    setEditingId(null);
    // draft를 인자로 넘겨 확정 — 스토어 title을 다시 읽지 않는다(P1-1).
    if (id) void commitTitle(id, draftRef.current);
  };
  const cancelEdit = () => {
    const id = editingId;
    setEditingId(null);
    // Esc는 원값 복원만 — 영속하지 않는다(P1-2).
    if (id) cancelTitleEdit(id);
  };

  /* ─ 선택: Shift 범위 ─ */
  const lastIndexRef = useRef<number | null>(null);
  const handleToggle = (index: number, rowId: string, shift: boolean) => {
    if (shift && lastIndexRef.current !== null) {
      const a = Math.min(lastIndexRef.current, index);
      const b = Math.max(lastIndexRef.current, index);
      const next = new Set(selectedIds);
      for (let i = a; i <= b; i++) next.add(rows[i].id);
      setSelectedIds(next);
    } else {
      toggleSelected(rowId);
    }
    lastIndexRef.current = index;
  };

  // 필터·검색·정렬로 보이지 않게 된 행은 선택에서 뺀다(P2-2). 정렬이 바뀌면
  // Shift 범위 기준 인덱스도 무효라 리셋한다.
  useEffect(() => {
    const visible = new Set(rows.map((r) => r.id));
    const next = new Set([...selectedIds].filter((id) => visible.has(id)));
    if (next.size !== selectedIds.size) setSelectedIds(next);
  }, [rows, selectedIds, setSelectedIds]);

  useEffect(() => {
    lastIndexRef.current = null;
  }, [sort]);

  /* ─ 키보드 탐색(§8) ─ */
  const [focusIndex, setFocusIndex] = useState(-1);

  // 포커스된 행이 가상화 창 밖이면 스크롤해 보이게 한다(P2-3).
  const ensureRowVisible = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = index * ROW_H;
    const bottom = top + ROW_H;
    if (top < el.scrollTop) {
      el.scrollTop = top;
    } else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight;
    }
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editingId) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(rows.length - 1, focusIndex + 1);
      setFocusIndex(next);
      ensureRowVisible(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, focusIndex - 1);
      setFocusIndex(next);
      ensureRowVisible(next);
    } else if (e.key === " " && focusIndex >= 0 && focusIndex < rows.length) {
      e.preventDefault();
      toggleSelected(rows[focusIndex].id);
    } else if (e.key === "Enter" && focusIndex >= 0 && focusIndex < rows.length) {
      e.preventDefault();
      void openMemo(rows[focusIndex].id);
    }
  };

  const isEmpty = rows.length === 0;
  const emptySearch = isEmpty && query.trim() !== "";

  return (
    <div className="flex h-full flex-col bg-bg">
      <MemoTableToolbar />

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-accent-lime/10 px-3 py-1.5 text-xs text-text">
          <span className="font-medium">
            {t("workspace.table.selection.count", { count: selectedIds.size })}
          </span>
          <button
            type="button"
            onClick={() => void trashSelected()}
            className="cursor-pointer rounded-md border border-border px-2 py-0.5 hover:bg-panel"
          >
            {t("workspace.table.selection.trash")}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="cursor-pointer rounded-md px-2 py-0.5 text-text-soft hover:bg-panel"
          >
            {t("workspace.table.selection.clear")}
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onGridKeyDown}
        role="grid"
        aria-label={t("workspace.table.aria.grid")}
        aria-rowcount={rows.length}
        tabIndex={0}
      >
        <div style={gridStyle}>
          <div
            role="row"
            className="sticky top-0 z-20 border-b border-border bg-bg"
            style={gridStyle}
          >
            <HeaderCell className="justify-center">
              <span className="sr-only">{t("workspace.table.column.select")}</span>
            </HeaderCell>
            <HeaderCell />
            <SortHeader
              label={t("workspace.table.column.title")}
              sortKey="title"
              sort={sort}
              onSort={setSort}
            />
            <HeaderCell>{t("workspace.table.column.preview")}</HeaderCell>
            <HeaderCell>{t("workspace.table.column.board")}</HeaderCell>
            <HeaderCell>{t("workspace.table.column.frame")}</HeaderCell>
            <HeaderCell>{t("workspace.table.column.attachments")}</HeaderCell>
            <SortHeader
              label={t("workspace.table.column.createdAt")}
              sortKey="createdAt"
              sort={sort}
              onSort={setSort}
            />
            <SortHeader
              label={t("workspace.table.column.updatedAt")}
              sortKey="updatedAt"
              sort={sort}
              onSort={setSort}
            />
          </div>

          {!isEmpty && (
            <div
              className="relative"
              style={{ height: rows.length * ROW_H }}
              role="rowgroup"
            >
              {visible.map((row, i) => {
                const index = start + i;
                const selected = selectedIds.has(row.id);
                const focused = focusIndex === index;
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-selected={selected}
                    data-testid="memo-table-row"
                    onClick={() => void openMemo(row.id)}
                    className={[
                      "group absolute left-0 w-full cursor-pointer items-center border-b border-border/60 text-xs text-text",
                      selected ? "bg-accent-lime/10" : "hover:bg-panel",
                      focused ? "ring-1 ring-inset ring-accent-blue" : "",
                    ].join(" ")}
                    style={{
                      ...gridStyle,
                      top: index * ROW_H,
                      height: ROW_H,
                    }}
                  >
                    {/* 선택 */}
                    <div
                      role="gridcell"
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        aria-label={
                          row.title || t("workspace.table.untitled")
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(index, row.id, e.shiftKey);
                        }}
                        onChange={() => {
                          /* 클릭 이벤트에서 처리(Shift 범위) — 여기선 no-op */
                        }}
                      />
                    </div>

                    {/* 색 스와치(읽기 전용) */}
                    <div role="gridcell" className="flex items-center justify-center">
                      <span
                        className="h-3 w-3 rounded-full border border-border"
                        style={{ background: memoTint(row.id) }}
                        aria-hidden
                      />
                    </div>

                    {/* 제목 — 인라인 편집 */}
                    <div
                      role="gridcell"
                      className="flex items-center px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit(row);
                      }}
                    >
                      {editingId === row.id ? (
                        <input
                          autoFocus
                          value={draft}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            draftRef.current = e.target.value;
                            setTitle(row.id, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              finishEdit();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          onBlur={finishEdit}
                          aria-label={t("workspace.memo.title.label")}
                          className="w-full rounded border border-accent-blue bg-bg px-1 py-0.5 text-xs outline-none"
                        />
                      ) : row.title ? (
                        <span className="truncate">{row.title}</span>
                      ) : (
                        <span className="truncate text-text-muted">
                          {t("workspace.table.untitled")}
                        </span>
                      )}
                    </div>

                    {/* 본문 미리보기 */}
                    <div
                      role="gridcell"
                      className="flex items-center truncate px-2 text-text-soft"
                    >
                      <Preview row={row} />
                    </div>

                    {/* 보드 경로 */}
                    <div role="gridcell" className="flex items-center truncate px-2 text-text-soft">
                      {row.boardPath}
                    </div>

                    {/* 메모판 이름 */}
                    <div role="gridcell" className="flex items-center truncate px-2 text-text-soft">
                      {row.frameName ?? ""}
                    </div>

                    {/* 첨부 배지 */}
                    <div role="gridcell" className="flex items-center gap-1 px-2">
                      {BADGE_ORDER.filter((b) => row.badgeCounts[b.key] > 0).map(
                        (b) => (
                          <span key={b.key} className="text-[11px] text-text-soft">
                            <span aria-hidden>{b.icon}</span>
                            {row.badgeCounts[b.key]}
                          </span>
                        ),
                      )}
                    </div>

                    {/* 만든 날 / 고친 날 */}
                    <div role="gridcell" className="flex items-center px-2 text-text-soft">
                      {fmtDate(row.createdAt)}
                    </div>
                    <div role="gridcell" className="flex items-center px-2 text-text-soft">
                      {fmtDate(row.updatedAt)}
                    </div>

                    {/* 캔버스에서 보기 — hover 시 노출 */}
                    <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openCardOnCanvas(row.id);
                        }}
                        className="pointer-events-auto rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-text-soft opacity-0 shadow-card transition-opacity hover:text-text group-hover:opacity-100"
                      >
                        {t("workspace.table.action.viewOnCanvas")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <p className="text-sm font-medium text-text">
                {emptySearch
                  ? t("workspace.table.emptySearch.title")
                  : t("workspace.table.empty.title")}
              </p>
              <p className="text-xs text-text-muted">
                {emptySearch
                  ? t("workspace.table.emptySearch.body")
                  : t("workspace.table.empty.body")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderCell({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="columnheader"
      className={`flex items-center px-2 py-1.5 text-[11px] font-medium text-text-soft ${className}`}
    >
      {children}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: MemoSortKey;
  sort: { key: MemoSortKey; dir: "asc" | "desc" };
  onSort: (key: MemoSortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      role="columnheader"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(sortKey)}
      className="flex cursor-pointer items-center gap-1 px-2 py-1.5 text-left text-[11px] font-medium text-text-soft hover:text-text"
    >
      {label}
      <span aria-hidden className={active ? "text-text" : "text-text-muted"}>
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

function Preview({ row }: { row: MemoRow }) {
  if (!row.preview) {
    return <span className="text-text-muted">—</span>;
  }
  const m = row.match;
  if (!m) return <span className="truncate">{row.preview}</span>;
  return (
    <span className="truncate">
      {row.preview.slice(0, m.start)}
      <mark className="rounded bg-accent-lime/50 text-text">
        {row.preview.slice(m.start, m.start + m.length)}
      </mark>
      {row.preview.slice(m.start + m.length)}
    </span>
  );
}
