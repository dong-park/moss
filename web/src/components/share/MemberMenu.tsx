"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useT } from "@/i18n/Provider";
import type { BoardMember, MemberRole } from "@/state/share";
import { MemberAvatar } from "./MemberAvatar";

/**
 * 시안 v3 ③ — 멤버 이름을 누르면 나오는 메뉴 (spec §9).
 *
 * 소유자: 다른 사람 → 내보내기, 항상 → 링크 재발급·공유 해제.
 * 편집자: 나가기만.
 */
export function MemberMenu({
  member,
  viewerRole,
  disabled = false,
  onRemove,
  onReissue,
  onUnshare,
  onLeave,
}: {
  member: BoardMember;
  viewerRole: MemberRole;
  disabled?: boolean;
  onRemove?: (userId: string) => void;
  onReissue?: () => void;
  onUnshare?: () => void;
  onLeave?: () => void;
}) {
  const t = useT();
  const isOwner = viewerRole === "owner";

  const itemClass =
    "cursor-pointer rounded-md px-3 py-1.5 text-[13px] text-text outline-none transition-colors data-[highlighted]:bg-panel";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={t("collab.share.memberMenuAria", { name: member.name })}
          data-member-id={member.id}
          className="row flex w-full cursor-pointer items-center gap-2.5 rounded-md px-1 py-[7px] text-left text-[13px] text-text transition-colors hover:bg-panel disabled:cursor-default"
        >
          <MemberAvatar member={member} className="h-[22px] w-[22px] text-[10px]" />
          <span>{member.name}</span>
          {member.role === "owner" ? (
            <span className="ml-auto text-[12px] text-text-soft">
              {t("collab.share.owner")}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-[var(--z-panel)] min-w-36 rounded-lg border border-border bg-bg p-1 shadow-card-lift"
        >
          {isOwner && member.role !== "owner" ? (
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => onRemove?.(member.id)}
            >
              {t("collab.share.remove")}
            </DropdownMenu.Item>
          ) : null}

          {isOwner ? (
            <>
              <DropdownMenu.Item className={itemClass} onSelect={() => onReissue?.()}>
                {t("collab.share.reissue")}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer rounded-md px-3 py-1.5 text-[13px] text-red-600 outline-none transition-colors data-[highlighted]:bg-panel"
                onSelect={() => onUnshare?.()}
              >
                {t("collab.share.unshare")}
              </DropdownMenu.Item>
            </>
          ) : (
            <DropdownMenu.Item className={itemClass} onSelect={() => onLeave?.()}>
              {t("collab.share.leave")}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
