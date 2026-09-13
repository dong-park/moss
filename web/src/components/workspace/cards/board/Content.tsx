"use client";

import Image from "next/image";
import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import type { Card } from "@/state/workspace";

/* ─────────────────────────────────────────────────────────────
 * FEAT-subcanvas / FEAT-sticky-redesign — "파일함" 카드. 더블클릭하면 boardRef
 * 서브 캔버스로 진입한다. n10 브라우저 결함6: 옛 디자인(📦 이모지 + "이름 없는
 * 캔버스")이 시안(파스텔 블루 파일박스 아이콘 + "파일함" 문구)과 달랐다 —
 * 독과 같은 filebox 아이콘(`/icons/dock/filebox.png`)으로 바꾸고 이름 폴백을
 * "이름 없는 파일함"으로 바꾼다. 카드 개수 표시(cards.board.count)는 그대로.
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
      <Image
        src="/icons/dock/filebox.png"
        alt=""
        aria-hidden="true"
        width={88}
        height={88}
        unoptimized
        draggable={false}
        className="mx-auto h-9 w-9 select-none object-contain"
      />
      <span className="mt-2 truncate text-[13px] font-semibold text-text">
        {name}
      </span>
      <span className="mt-0.5 text-[12px] text-text-muted">
        {t("cards.board.count", { count })}
      </span>
    </article>
  );
}
