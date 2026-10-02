"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useT } from "@/i18n/Provider";
import { useAuth } from "@/state/auth";
import { MemberAvatar } from "@/components/share/MemberAvatar";

/**
 * 우상단 계정 아이콘 → 이름 + 로그아웃 메뉴 (spec/logout.md).
 * 확인 창은 없다 — 로그아웃해도 이 기기의 보드는 남고, 공유 연결은 CollabSession이 끊는다.
 */
export function AccountMenu() {
  const t = useT();
  const user = useAuth((s) => s.user);
  if (!user) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("collab.auth.account.menu")}
          className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full"
        >
          <MemberAvatar member={user} className="h-[32px] w-[32px] text-[13px]" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[var(--z-panel)] w-[200px] rounded-[10px] border border-border bg-white p-1 shadow-modal"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 text-[13px] font-semibold text-text">
            <MemberAvatar member={user} className="h-[20px] w-[20px] flex-none text-[10px]" />
            <span className="truncate">{user.name.trim() || "?"}</span>
          </div>
          <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Item
            className="cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] text-text outline-none transition-colors data-[highlighted]:bg-hover"
            onSelect={() => void useAuth.getState().logout()}
          >
            {t("collab.auth.account.logout")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
