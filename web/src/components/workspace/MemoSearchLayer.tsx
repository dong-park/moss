"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import type { MatchRange } from "@/state/memoSearch";
import {
  loadAllWallsIndex,
  searchAllWalls,
  type AllWallsIndex,
  type AllWallsResult,
  type AllWallsRow,
} from "@/state/memoSearchAllWalls";
import { useT } from "@/i18n/Provider";
import { isCommitEnter, isComposingKey } from "./ime";

/**
 * 검색 창(⌘K / ⌘F) + 캔버스 강조/dim 오버레이.
 *
 * 자기완결 레이어: Canvas에 한 줄로 마운트된다(MarkerTray 등 다른 자기완결 레이어와 동일 패턴).
 *  - ⌘K·⌘F(Ctrl+K·Ctrl+F)가 같은 창을 연다(KS-4 D1 = A). 시안 09-search 모양.
 *  - 창을 열 때 모든 벽의 글을 한 번 읽어 색인을 만들고(KS-3), 창이 열린 동안 재사용한다.
 *  - 입력 디바운스 150ms → 결과 목록 + store.filterByKeyword(지금 벽 강조·흐림, 기존 AC-2).
 *  - ↑↓로 고르고 Enter·클릭이면 그 벽으로 날아가 반짝인다(KS-5 `jumpToCardWithFlash`).
 *  - Esc는 창만 닫는다 — 벽과 화면 위치는 그대로다.
 *  - 한글 조합 중 Enter는 글자 확정이라 결과로 가지 않는다(KS-2 `isCommitEnter`).
 */
const DEBOUNCE_MS = 150;
/** card.height가 없는(자동 높이) 카드의 오버레이 폴백 높이. 실측값이 있으면 덮인다. */
const FALLBACK_CARD_HEIGHT = 80;

const EMPTY_INDEX: AllWallsIndex = { buckets: new Map(), updatedAt: new Map() };
const EMPTY_RESULT: AllWallsResult = { rows: [], more: 0 };

/** 시안 09-search(`mockups/gen.py`) 값. */
const SELECTED_BG = "#f2f5fb";
const MARK_BG = "#ffe48a";
const CARET = "#2457b8";
const SOFT_TEXT = "#999";

/** 한 줄 글 위에 칠할 구간을 `<mark>`로 감싼다. 구간은 시작 순이고 겹치지 않는다. */
function Marked({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark
        key={i}
        style={{ background: MARK_BG, padding: "0 2px", color: "inherit" }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** 줄 왼쪽 네모 — 포스트잇은 종이 색, 종이 없는 글상자·사진은 흰 네모에 테두리. */
function swatchStyle(row: AllWallsRow): React.CSSProperties {
  if (row.kind === "text") {
    return { background: row.color, boxShadow: "0 1px 2px rgba(0,0,0,.2)" };
  }
  return { background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.25)" };
}

export function MemoSearchLayer() {
  const t = useT();
  const filterByKeyword = useWorkspace((s) => s.filterByKeyword);
  const matchIds = useWorkspace((s) => s.memoSearchMatchIds);
  const query = useWorkspace((s) => s.memoSearchQuery);
  const cards = useWorkspace((s) => s.cards);
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const viewport = useWorkspace((s) => s.viewport);

  const [value, setValue] = useState("");
  /** 디바운스를 지난 검색어 — 결과 목록은 이걸로 만든다. */
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  /** 창이 열린 동안 쓰는 모든 벽 색인. 읽는 중이면 null. */
  const [index, setIndex] = useState<AllWallsIndex | null>(null);
  const [selected, setSelected] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = query.trim().length > 0;
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);

  const close = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
    setValue("");
    setDebounced("");
    setIndex(null);
    setSelected(0);
    // 강조·흐림은 바로 걷는다 — 디바운스를 기다리면 닫은 뒤에도 잠깐 남는다.
    filterByKeyword("");
  }, [filterByKeyword]);

  // 디바운스 150ms → 결과 목록 + 캔버스 필터.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      filterByKeyword(value);
      setDebounced(value);
      setSelected(0);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, filterByKeyword]);

  // ⌘K·⌘F → 열고 포커스. 한글 입력기에선 key 가 자모로 올 수 있어 code 로도 본다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      const isK = key === "k" || e.code === "KeyK";
      const isF = key === "f" || e.code === "KeyF";
      if (!isK && !isF) return;
      e.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 열린 동안 Esc → 창만 닫는다. capture 로 받아 Canvas 의 Esc(선택 해제·상위 벽 이동)보다
  // 먼저 소비한다 — 벽과 화면 위치를 그대로 둔다. 한글 조합 중 Esc 는 조합 취소라 건드리지 않는다.
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isComposingKey(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [open, close]);

  // 열리면 입력에 포커스한다.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 열 때 모든 벽의 글을 한 번 읽는다. 닫으면 `close`가 색인을 버린다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadAllWallsIndex()
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch(() => {
        // 읽기 실패 — 지금 벽은 store 로 찾으므로 빈 색인으로 계속한다.
        if (!cancelled) setIndex(EMPTY_INDEX);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 자동 높이 카드의 실측 높이 — 검색 활성 시 DOM에서 수집(오버레이가 본문을 가리도록).
  // 레이아웃/페인트 이후 rAF에서 측정해 effect 본문의 동기 setState를 피한다.
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      const next: Record<string, number> = {};
      document
        .querySelectorAll<HTMLElement>("[data-card-id]")
        .forEach((el) => {
          const id = el.dataset.cardId;
          if (id && el.offsetHeight > 0) next[id] = el.offsetHeight;
        });
      setHeights(next);
    });
    return () => cancelAnimationFrame(raf);
  }, [active, cards, query]);

  // FEAT-text-tool P2-3: textbox도 평문 검색 대상이라 강조·결과 목록에 포함한다.
  // FEAT-photo-card: 사진은 캡션(content)으로 검색·강조한다.
  const textCards = useMemo(
    () =>
      cards.filter(
        (c) => c.kind === "text" || c.kind === "textbox" || c.kind === "photo",
      ),
    [cards],
  );

  // 색인을 읽는 동안에도 지금 벽은 store 카드로 바로 찾는다.
  const result = useMemo<AllWallsResult>(() => {
    if (!open || !debounced.trim()) return EMPTY_RESULT;
    return searchAllWalls(index ?? EMPTY_INDEX, debounced, {
      boardId: currentBoardId,
      cards,
    });
  }, [open, debounced, index, currentBoardId, cards]);
  const rows = result.rows;
  const selectedIndex = Math.min(selected, Math.max(rows.length - 1, 0));

  // 키보드로 옮긴 줄이 목록 밖이면 보이게 스크롤한다.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex, rows]);

  const pick = useCallback(
    (id: string) => {
      close();
      void useWorkspace.getState().jumpToCardWithFlash(id);
    },
    [close],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중 키는 입력기 몫이다 — 화살표는 후보 고르기, Enter 는 글자 확정.
    if (isComposingKey(e)) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(Math.min(selectedIndex + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(Math.max(selectedIndex - 1, 0));
    } else if (isCommitEnter(e)) {
      e.preventDefault();
      // 디바운스 안에 Enter 를 쳤으면 목록이 낡았다 — 지금 값으로 다시 찾는다.
      const fresh =
        value === debounced
          ? rows
          : searchAllWalls(index ?? EMPTY_INDEX, value, {
              boardId: currentBoardId,
              cards,
            }).rows;
      const row = fresh[value === debounced ? selectedIndex : 0];
      if (row) pick(row.id);
    }
  };

  const showEmpty = index !== null && debounced.trim().length > 0 && rows.length === 0;

  return (
    <>
      {/* 강조/dim 오버레이 — Canvas world layer와 동일 transform. */}
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-[var(--z-selection)]"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {textCards.map((c) => {
            const isMatch = matchSet.has(c.id);
            const h = c.height ?? heights[c.id] ?? FALLBACK_CARD_HEIGHT;
            return (
              <div
                key={c.id}
                className="absolute rounded-[8px]"
                style={
                  isMatch
                    ? {
                        left: c.x,
                        top: c.y,
                        width: c.width,
                        height: h,
                        boxShadow:
                          "0 0 0 2px rgba(79,124,243,0.9), 0 0 16px 3px rgba(79,124,243,0.45)",
                      }
                    : {
                        left: c.x,
                        top: c.y,
                        width: c.width,
                        height: h,
                        background: "rgba(250,250,250,0.6)",
                      }
                }
              />
            );
          })}
        </div>
      )}

      {/* 검색 창 — 벽을 살짝 어둡게 하고 위쪽 가운데에 흰 시트(시안 09-search). */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("common.search")}
          className="pointer-events-auto absolute inset-0 z-[var(--z-overlay)]"
        >
          <div
            data-testid="memo-search-dim"
            aria-label={t("workspace.memoSearch.dismiss")}
            className="absolute inset-0"
            style={{ background: "rgba(30,30,30,0.28)" }}
            onMouseDown={close}
          />
          <div
            className="absolute left-1/2 top-[90px] w-[560px] max-w-[calc(100%-32px)] -translate-x-1/2 overflow-hidden rounded-2xl"
            style={{
              background: "#fff",
              boxShadow: "0 30px 60px -20px rgba(0,0,0,.45)",
            }}
          >
            <div
              className="flex items-center gap-[10px] border-b px-[18px] py-[18px]"
              style={{ borderColor: "#eee" }}
            >
              <span aria-hidden="true" className="text-[22px]" style={{ color: SOFT_TEXT }}>
                ⌕
              </span>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={rows.length > 0}
                aria-controls="memo-search-results"
                aria-activedescendant={
                  rows.length > 0 ? `memo-search-row-${selectedIndex}` : undefined
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={t("common.search")}
                aria-label={t("common.search")}
                className="min-w-0 flex-1 bg-transparent text-[22px] text-[#1f2430] outline-none placeholder:text-[#bbb]"
                style={{ caretColor: CARET }}
              />
            </div>

            {rows.length > 0 && (
              <div
                ref={listRef}
                id="memo-search-results"
                role="listbox"
                aria-label={t("workspace.memoSearch.results")}
                className="max-h-[min(50vh,420px)] overflow-y-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {rows.map((row, i) => (
                  <div
                    key={row.id}
                    id={`memo-search-row-${i}`}
                    role="option"
                    aria-selected={i === selectedIndex}
                    onMouseMove={() => {
                      if (i !== selectedIndex) setSelected(i);
                    }}
                    onClick={() => pick(row.id)}
                    className="flex cursor-pointer items-center justify-between gap-4 px-[18px] py-3"
                    style={{ background: i === selectedIndex ? SELECTED_BG : undefined }}
                  >
                    <div className="flex min-w-0 items-center text-[16px] text-[#1f2430]">
                      <span
                        aria-hidden="true"
                        className="mr-[10px] inline-block h-[14px] w-[14px] shrink-0"
                        style={swatchStyle(row)}
                      />
                      <span className="truncate">
                        <Marked text={row.text} ranges={row.ranges} />
                      </span>
                    </div>
                    <div className="shrink-0 text-[13px]" style={{ color: SOFT_TEXT }}>
                      {row.boardName}
                    </div>
                  </div>
                ))}
                {result.more > 0 && (
                  <div className="px-[18px] py-2 text-[12px]" style={{ color: SOFT_TEXT }}>
                    {t("workspace.memoSearch.more", { count: result.more })}
                  </div>
                )}
              </div>
            )}

            {showEmpty && (
              <div
                className="px-[18px] py-6 text-center text-[14px]"
                style={{ color: SOFT_TEXT }}
              >
                {t("workspace.memoSearch.empty")}
              </div>
            )}

            {/* 안내 줄 — 결과 유무와 상관없이 늘 보인다. */}
            <div
              className="border-t px-[18px] py-[10px] text-[12px]"
              style={{ borderColor: "#eee", color: SOFT_TEXT }}
            >
              {t("workspace.memoSearch.hint")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
