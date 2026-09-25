"use client";

import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import type { Card } from "@/state/workspace";

/* ─────────────────────────────────────────────────────────────
 * FEAT-subcanvas / FEAT-sticky-redesign — "파일함" 카드. 더블클릭하면 boardRef
 * 서브 캔버스로 진입한다.
 *
 * 2026-09-23 마닐라 폴더 개선: 흔한 UI 타일(파란 플라스틱 상자) 대신 메모 카드와
 * 같은 "실사 사물" 기법으로 그린다 — 종이 사진 png 배경 + 레이어.
 *   - board-back.png   뒷판+탭+라벨판 (맨 아래)
 *   - board-papers-*.png 삐져나온 노란 종이(0장 없음 / 1~3장 low / 4장+ high).
 *   - board-front.png  앞판. 드롭 대상이면 살짝 내려가 벌어진 느낌을 준다.
 * 기울기는 memoVariety가 board kind에도 적용한다(메모보다 작은 상한).
 *
 * 이름은 앞판 가운데, 개수는 탭 라벨판 위에 표시한다.
 * 더블클릭 진입은 DraggableCard.onDoubleClick이 담당한다.
 * ───────────────────────────────────────────────────────────── */

const BACK = 'url("/cards/v2/board-back.png") 0 0 / 100% 100% no-repeat';
const FRONT = 'url("/cards/v2/board-front.png") 0 0 / 100% 100% no-repeat';
const PAPERS = (state: "low" | "high") =>
  `url("/cards/v2/board-papers-${state}.png") 0 0 / 100% 100% no-repeat`;

/** 개수 → 삐져나온 종이 상태. 0장은 종이 없음. 4장 이상은 두툼한 high. */
function paperState(count: number): "low" | "high" | null {
  if (count <= 0) return null;
  return count >= 4 ? "high" : "low";
}

export function BoardCardContent({ card }: { card: Card }) {
  const t = useT();
  const rawName = useWorkspace((s) => {
    const board = s.boards.find((b) => b.id === card.boardRef);
    return board?.name.trim() ?? "";
  });
  const count = useWorkspace((s) =>
    card.boardRef ? (s.subcanvasCounts[card.boardRef] ?? 0) : 0,
  );
  // 드래그 중인 카드가 이 함 위에 올라왔는지 — 드롭 하이라이트(앞판이 벌어진다).
  const isDropTarget = useWorkspace((s) => s.dropTargetFunnelId === card.id);

  const slip = paperState(count);
  const name = rawName || t("cards.board.unnamed");
  const countLabel = count > 99 ? "99+" : t("cards.board.shortCount", { count });
  return (
    <article
      className="relative h-full w-full"
      style={{ isolation: "isolate" }}
    >
      {/* 640/514는 scripts/gen-filebox-assets.py의 WIDTH×HEIGHT(CROP 비율)와 같아야 한다 —
        * CROP을 바꾸면 여기도 고친다. 다르면 레이어 png가 늘어나 이름·종이 위치가 어긋난다. */}
      <div className="absolute left-0 top-1/2 w-full -translate-y-1/2" style={{ aspectRatio: "640 / 514", containerType: "inline-size" }}>
      {/* 뒷판+탭 — 맨 아래 레이어. 접지 그림자 포함. */}
      <div
        aria-hidden="true"
        data-board-back
        className="pointer-events-none absolute inset-0"
        style={{ background: BACK }}
      />
      {/* 사진의 노란 종이 — 뒷판 위, 앞판 아래. */}
      {slip && (
          <div
            aria-hidden="true"
            data-board-papers={slip}
            className="pointer-events-none absolute inset-0"
            style={{ background: PAPERS(slip) }}
          />
      )}
      {/* 앞판 — 드롭 대상이면 살짝 내려가 함이 벌어진 느낌. */}
      <div
        aria-hidden="true"
        data-board-front
        className="pointer-events-none absolute inset-0 transition-transform duration-150 ease-out"
        style={{
          background: FRONT,
          transform: isDropTarget ? "translateY(2.5%)" : undefined,
        }}
      />
      {/* 앞판 가운데 이름. 작은 카드에서도 읽히고 긴 이름은 두 줄까지만. */}
      <span
        data-board-name
        title={name}
        className="pointer-events-none absolute overflow-hidden text-center font-semibold leading-snug"
        style={{
          left: "10%", top: "47%", width: "80%", maxHeight: "29%",
          fontSize: "clamp(10px, 7.5cqw, 22px)",
          color: rawName ? "#3b3426" : "rgba(60,52,36,0.48)",
          display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
        }}
      >
        {name}
      </span>
      {/* 탭의 흰 라벨판에는 개수만. */}
      <span
        data-board-count
        className="pointer-events-none absolute flex items-center justify-center overflow-hidden whitespace-nowrap font-semibold text-[#3b3426]"
        style={{ left: "8%", top: "4.5%", width: "25%", height: "8%", fontSize: "clamp(8px, 4.5cqw, 10px)" }}
      >
        {countLabel}
      </span>
      </div>
    </article>
  );
}
