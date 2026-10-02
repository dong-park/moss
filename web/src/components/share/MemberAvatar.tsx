"use client";

import type { BoardMember } from "@/state/share";

/**
 * 참여자 시스템 색 8개 (spec §4). 접속 순서로 배정하는 colors.ts와 달리
 * 보드마다 접속 순서가 아니라 멤버 id로 고정한다 — 아바타가 새로고침마다
 * 흔들리지 않게. 색 목록 자체는 colors.ts(SYSTEM_COLORS)와 같은 값이다.
 */
export const COLLAB_COLORS = [
  "#5e5ce6",
  "#ff9f0a",
  "#30d158",
  "#0a84ff",
  "#ff375f",
  "#bf5af2",
  "#ffd60a",
  "#64d2ff",
] as const;

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

function initial(name: string): string {
  return name.trim().slice(0, 1) || "?";
}

/** 원형 아바타. 크기는 className으로 조절한다. */
export function MemberAvatar({
  member,
  className = "h-[22px] w-[22px] text-[10px]",
}: {
  member: Pick<BoardMember, "id" | "name">;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ background: colorForId(member.id) }}
    >
      {initial(member.name)}
    </span>
  );
}

/** 우상단 아이콘 왼쪽에 겹쳐 놓는 아바타 줄. */
export function MemberAvatarRow({ members }: { members: BoardMember[] }) {
  if (members.length === 0) return null;
  return (
    <div className="flex">
      {members.map((member) => (
        <MemberAvatar
          key={member.id}
          member={member}
          className="-ml-[5px] h-[22px] w-[22px] text-[10px] shadow-[0_0_0_2px_var(--color-bg,#ecedef)] ring-2 ring-bg first:ml-0"
        />
      ))}
    </div>
  );
}
