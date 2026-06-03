"use client";

import { useSyncExternalStore } from "react";
import {
  isCardConflicted,
  resolveConflict,
  subscribeConflict,
} from "@/state/db/liveSync";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-multitab-sync (W8) — "다른 탭에서 변경됨" 비방해 배너.
 *
 * 편집 중인 카드가 다른 탭에서 변경/삭제되면 liveSync가 충돌 플래그를 세운다.
 * 이 배너는 그 카드 위에 떠서 사용자에게 알리고, "새로고침"으로 최신 버전을
 * 가져온다(로컬 편집을 버리고 DB 최신본으로 교체). spec §7.
 * ───────────────────────────────────────────────────────────── */

export function MultitabConflictBanner({ cardId }: { cardId: string }) {
  const conflicted = useSyncExternalStore(
    subscribeConflict,
    () => isCardConflicted(cardId),
    () => false,
  );

  if (!conflicted) return null;

  return (
    <div
      role="status"
      className="absolute left-1 right-1 top-1 z-20 flex items-center justify-between gap-2 rounded-md bg-amber-100/95 px-2 py-1 text-[11px] text-amber-900 shadow ring-1 ring-amber-300"
    >
      <span>다른 탭에서 변경됨</span>
      <button
        type="button"
        className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 font-medium text-white hover:bg-amber-600"
        onMouseDown={(e) => {
          // 카드 편집 blur/commit보다 먼저 처리되도록 mousedown에서 즉시 해소.
          e.preventDefault();
          e.stopPropagation();
          void resolveConflict(cardId);
        }}
      >
        새로고침
      </button>
    </div>
  );
}
