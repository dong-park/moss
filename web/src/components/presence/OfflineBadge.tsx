"use client";

import { useT } from "@/i18n/Provider";
import { useCollab } from "@/state/collab";
import { useOnlineStatus } from "@/state/network";

/**
 * FEAT-collab-auth n7 (AC-10) — 공유 보드가 열려 있는 동안 네트워크가 끊기면
 * 우상단에 "오프라인"을 띄운다. 편집을 막지 않는다 — 표시만 한다.
 */
export function OfflineBadge() {
  const online = useOnlineStatus();
  const boardId = useCollab((s) => s.boardId);
  const t = useT();

  if (online || boardId === null) return null;

  return (
    <span
      role="status"
      data-testid="offline-badge"
      className="rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-medium text-text-soft shadow-[0_0_0_.5px_rgba(0,0,0,.08)] backdrop-blur"
    >
      {t("collab.offline")}
    </span>
  );
}
