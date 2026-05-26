"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { LockIcon } from "@/components/icons";
import { useT } from "@/i18n/Provider";

/**
 * 자물쇠 배지 — 이 메모는 AI 호출에서 제외됨을 알린다 (FEAT-privacy AC-4).
 *
 * 톤: 회색·잔잔 (강제·경고 톤 금지).
 * 접근성: aria-label + tooltip.
 */
export function AIOptOutBadge({ size = 14 }: { size?: number }) {
  const t = useT();
  const label = t("privacy.card.badge");
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          aria-label={label}
          className="inline-flex items-center justify-center rounded-sm text-text-soft"
          style={{ width: size + 4, height: size + 4 }}
        >
          <LockIcon size={size} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={4}
          className="z-[var(--z-toast)] rounded-md bg-text px-2 py-1 text-[11px] text-bg shadow-card-lift"
        >
          {label}
          <Tooltip.Arrow className="fill-text" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
