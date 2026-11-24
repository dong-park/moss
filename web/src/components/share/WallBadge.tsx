"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/Provider";
import { useWallShareState, type WallShareState } from "@/state/share";

/**
 * local-promise n3 — 벽 오른쪽 위 배지. 이 벽이 어디 있는지 늘 알린다.
 * 상태는 n2의 `useWallShareState` 하나만 읽는다. 시안 01·06의 흰 반투명 알약이고,
 * 오른쪽 끝 `action` 자리에 "공유 ↗" 버튼이 들어간다(시스템 보드는 비워 둔다).
 */
export function WallBadge({ boardId, action }: { boardId: string; action?: ReactNode }) {
  const t = useT();
  const state = useWallShareState(boardId);

  return (
    <div
      data-testid="wall-badge"
      data-state={state}
      className="flex items-center gap-1.5 rounded-full border border-black/[.06] bg-white/75 px-3 py-1.5 text-[13px] font-semibold text-[#444] backdrop-blur-[6px]"
    >
      <span data-testid="wall-badge-label">{label(t, state)}</span>
      {action}
    </div>
  );
}

function label(t: (key: string) => string, state: WallShareState): string {
  switch (state) {
    case "uploading":
      return t("wall.badge.uploading");
    case "shared":
      return t("wall.badge.shared");
    case "sharedLoggedOut":
      return t("wall.badge.sharedLoggedOut");
    case "local":
      return t("wall.badge.local");
  }
}
