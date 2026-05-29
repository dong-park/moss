"use client";

import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import type { Card } from "@/state/workspace";

/* ─────────────────────────────────────────────────────────────
 * FEAT-subcanvas — "함" 카드. 더블클릭하면 boardRef 서브 캔버스로 진입한다.
 * 전용 PNG가 없어 폴더/함 톤의 종이 카드로 렌더(📦 + 이름 + "카드 N개").
 * 더블클릭 진입은 DraggableCard.onDoubleClick이 담당한다.
 * ───────────────────────────────────────────────────────────── */

export function BoardCardContent({ card }: { card: Card }) {
  const t = useT();
  const name = useWorkspace((s) => {
    const board = s.boards.find((b) => b.id === card.boardRef);
    const trimmed = board?.name.trim() ?? "";
    return trimmed === "" ? t("cards.board.unnamed") : trimmed;
  });
  const count = useWorkspace((s) =>
    card.boardRef ? (s.subcanvasCounts[card.boardRef] ?? 0) : 0,
  );
  // 드래그 중인 카드가 이 함 위에 올라왔는지 — 드롭 하이라이트.
  const isDropTarget = useWorkspace((s) => s.dropTargetFunnelId === card.id);

  return (
    <article
      className="flex h-full w-full flex-col justify-center rounded-[10px] px-4 py-5 text-center transition-shadow"
      style={{
        background: "var(--gradient-paper)",
        boxShadow: isDropTarget
          ? "0 0 0 2px var(--color-accent-lime), var(--shadow-card-lift)"
          : "var(--shadow-card)",
      }}
    >
      <span className="text-[34px] leading-none" aria-hidden>
        📦
      </span>
      <span className="mt-2 truncate text-[13px] font-semibold text-text">
        {name}
      </span>
      <span className="mt-0.5 text-[12px] text-text-muted">
        {t("cards.board.count", { count })}
      </span>
    </article>
  );
}
