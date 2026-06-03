"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-wikilinks (W5) — 백링크(역참조) 패널.
 *
 * 이 카드를 `[[위키링크]]`로 가리키는 다른 메모들을 접이식으로 보여준다
 * (spec §7 "접이식", AC-4). 항목 클릭 시 해당 메모로 점프(jumpToCard).
 * 역참조가 없으면 아무것도 렌더하지 않아 카드를 어지럽히지 않는다.
 *
 * 인덱스는 파생(persist X) — cards가 바뀌면 backlinksOf로 즉시 재계산되고,
 * id 기반 매칭이라 대상 제목이 바뀌어도 끊기지 않는다(AC-5).
 * ───────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useWorkspace, type Card } from "@/state/workspace";
import { backlinksOf, cardTitle, jumpToCard } from "./wikilink";

export function BacklinkPanel({ card }: { card: Card }) {
  const cards = useWorkspace((s) => s.cards);
  const [open, setOpen] = useState(false);
  const backlinks = useMemo(() => backlinksOf(cards, card.id), [cards, card.id]);

  if (backlinks.length === 0) return null;

  return (
    <div
      className="mt-1 border-t border-border/60 pt-1 text-[11px] text-text-muted"
      // 카드 본문 편집 클릭과 분리 — 패널 상호작용이 편집 진입을 트리거하지 않게.
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`역참조 ${backlinks.length}개`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-1 text-left hover:text-text"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>← 역참조 {backlinks.length}</span>
      </button>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {backlinks.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => jumpToCard(b.id)}
                title={cardTitle(b)}
                className="block w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[var(--accent,#3b5bdb)] hover:bg-panel"
              >
                {cardTitle(b) || "(제목 없음)"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
