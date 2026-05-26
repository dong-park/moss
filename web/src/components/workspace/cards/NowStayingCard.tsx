"use client";

import { useT } from "@/i18n/Provider";
import type { NowStayingItem } from "@/state/selectors/systemBoard";

/**
 * FEAT-home — "지금 머무는 생각" 큐레이팅 그룹 카드.
 * 일반 카드와 시각 구분: lime tint 배경 + 헤더 배지 (spec §7).
 * 가상 카드이므로 selection 시스템과 무관 (data-card-id 없음 → marquee 미포함).
 */
export function NowStayingCard({ item }: { item: NowStayingItem }) {
  const t = useT();
  return (
    <article
      data-testid="now-staying-card"
      className="rounded-md border border-border/60 bg-card-lime p-4 shadow-card"
      style={{ width: 240 }}
    >
      <header className="mb-2 flex items-center gap-2">
        <span className="rounded-sm bg-card-base px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {t("workspace.system.nowStaying.header")}
        </span>
        <span className="text-[11px] text-text-soft">
          {t("workspace.system.nowStaying.visitCount", {
            count: item.visitCount,
          })}
        </span>
      </header>
      <p className="line-clamp-3 text-sm font-medium leading-6 text-text">
        {item.theme}
      </p>
    </article>
  );
}
