"use client";

import type { Card } from "@/state/workspace";
import { useT } from "@/i18n/Provider";

/* ─────────────────────────────────────────────────────────────
 * Comment 카드 — author/time/body. body만 편집 가능 (FEAT-canvas system)
 * ───────────────────────────────────────────────────────────── */

export function CommentCardContent({ card }: { card: Card }) {
  const t = useT();
  return (
    <article
      className="rounded-[6px]"
      style={{
        background: `url("/cards/v2/comment.png") center/contain no-repeat`,
      }}
    >
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium"
            style={{
              background: "var(--color-accent-pink)",
              color: "#fff",
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            {(card.author ?? "?").slice(0, 1)}
          </span>
          <span className="text-[13px] font-medium text-text">
            {card.author ?? t("cards.author.fallback")}
          </span>
          <span className="text-[12px] text-text-muted">
            {card.time ?? t("cards.time.fallback")}
          </span>
        </div>
        <p className="ml-9 mt-1 text-[13px] leading-5 text-text">
          {card.content || (
            <span className="text-text-soft">{t("cards.body.empty")}</span>
          )}
        </p>
        <button className="ml-9 mt-1 cursor-pointer text-[12px] font-medium text-accent-link hover:underline">
          {t("cards.comment.reply")}
        </button>
      </div>
    </article>
  );
}
