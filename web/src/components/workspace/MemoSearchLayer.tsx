"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { plainText } from "@/state/memoSearch";
import { useT } from "@/i18n/Provider";

/**
 * FEAT-memo-fulltext-search (W4) — 검색 UI + 캔버스 강조/dim 오버레이.
 *
 * 자기완결 레이어: Canvas에 한 줄로 마운트된다(PenModeHud/PenToolbar와 동일 패턴).
 *  - 입력 디바운스 150ms → store.filterByKeyword (spec §8).
 *  - Cmd/Ctrl+F로 열고 포커스, Esc로 닫고 비움 (spec §7).
 *  - 매칭 카드는 보더/글로우, 비매칭 text 카드는 dim 스크림(AC-2).
 *  - 결과 클릭 → store.panToCard로 캔버스 팬·선택(AC-3).
 */
const DEBOUNCE_MS = 150;
/** card.height가 없는(자동 높이) 카드의 오버레이 폴백 높이. 실측값이 있으면 덮인다. */
const FALLBACK_CARD_HEIGHT = 80;

export function MemoSearchLayer() {
  const t = useT();
  const filterByKeyword = useWorkspace((s) => s.filterByKeyword);
  const panToCard = useWorkspace((s) => s.panToCard);
  const matchIds = useWorkspace((s) => s.memoSearchMatchIds);
  const query = useWorkspace((s) => s.memoSearchQuery);
  const cards = useWorkspace((s) => s.cards);
  const viewport = useWorkspace((s) => s.viewport);

  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = query.trim().length > 0;
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);

  // 디바운스 150ms → 캔버스 필터.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => filterByKeyword(value), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, filterByKeyword]);

  // Cmd/Ctrl+F → 열고 포커스. Esc → 닫고 비움(원상복귀).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (e.key === "Escape" && open) {
        setValue("");
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const textCards = useMemo(
    () => cards.filter((c) => c.kind === "text"),
    [cards],
  );

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

      {/* 검색 박스 + 결과 목록 — 상단 중앙 고정. */}
      {(open || active) && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-[var(--z-panel)] w-72 -translate-x-1/2">
          <div
            className="rounded-lg border border-border bg-bg p-1.5 shadow-card-lift"
            style={{ background: "var(--gradient-paper)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("common.search")}
              aria-label={t("common.search")}
              className="w-full rounded-md bg-transparent px-2 py-1 text-sm text-text outline-none placeholder:text-text-soft"
            />
            {active && (
              <div className="mt-1 max-h-60 overflow-y-auto border-t border-border pt-1">
                <div className="px-2 py-1 text-[11px] text-text-muted">
                  {matchIds.length}
                </div>
                {matchIds.map((id) => {
                  const card = textCards.find((c) => c.id === id);
                  if (!card) return null;
                  const snippet = plainText(card.content).slice(0, 48);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => panToCard(id)}
                      className="block w-full cursor-pointer truncate rounded-md px-2 py-1 text-left text-sm text-text transition-colors hover:bg-panel"
                    >
                      {snippet || "—"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
