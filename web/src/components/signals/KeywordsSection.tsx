"use client";

import { useT } from "@/i18n/Provider";
import type { KeywordItem } from "@/state/signals/types";

export function KeywordsSection({ items }: { items: KeywordItem[] }) {
  const t = useT();
  const max = items[0]?.count ?? 0;
  return (
    <section className="px-5 py-4">
      <h3 className="mb-3 text-[13px] font-medium text-text-muted tracking-wide">
        {t("signals.keywords.heading")}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item.token}
            className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-hover cursor-default transition-colors"
            title={item.token}
          >
            <span className="text-[14px] text-text">{item.token}</span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="block h-1 rounded-full bg-accent-lime opacity-60 group-hover:opacity-90 transition-opacity"
                style={{ width: max ? `${(item.count / max) * 60}px` : 0 }}
              />
              <span className="tabular-nums text-[12px] text-text-soft min-w-[18px] text-right">
                {item.count}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
