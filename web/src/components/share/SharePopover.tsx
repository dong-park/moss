"use client";

import styles from "./sharePopover.module.css";
import { useT } from "@/i18n/Provider";
import { MEMBER_LIMIT, type BoardMember, type MemberRole, type ShareStatus } from "@/state/share";
import { MemberMenu } from "./MemberMenu";

/**
 * 시안 v3 ③ — 공유 팝오버. 버튼 아래에 붙고 화면을 가리지 않는다. 링크 복사 줄 + 멤버 이름.
 * 공유 전 화면은 없다 — 공유는 가운데 시트(`ShareSheet`)로만 시작한다(local-promise n4).
 */
export interface SharePopoverProps {
  boardName: string;
  viewerRole: MemberRole;
  members: BoardMember[];
  inviteUrl: string | null;
  busy: boolean;
  error: string | null;
  copied: boolean;
  onCopy: () => void;
  onReissue: () => void;
  onRemove: (userId: string) => void;
  onUnshare: () => void;
  onLeave: () => void;
}

export function SharePopover({
  boardName,
  viewerRole,
  members,
  inviteUrl,
  busy,
  error,
  copied,
  onCopy,
  onReissue,
  onRemove,
  onUnshare,
  onLeave,
}: SharePopoverProps) {
  const t = useT();
  const full = members.length >= MEMBER_LIMIT;

  return (
    <div
      role="dialog"
      data-share-popover
      aria-label={t("collab.share.title")}
      className={`${styles.popover} absolute right-0 top-[calc(100%+8px)] z-[var(--z-panel)] max-h-[70dvh] overflow-y-auto max-w-[calc(100vw-16px)] w-[300px] rounded-2xl bg-white/85 p-[18px_18px_14px] shadow-[0_10px_30px_rgba(0,0,0,.10),0_0_0_.5px_rgba(0,0,0,.06)] backdrop-blur-[30px]`}
    >
      <h3 className="mb-2 text-[15px] font-semibold text-text">{boardName}</h3>

      {full ? (
        <p className="text-[12px] text-text-soft">{t("collab.share.full")}</p>
      ) : inviteUrl ? (
        <button
          type="button"
          onClick={onCopy}
          className="mb-2.5 flex cursor-pointer items-center gap-1.5 text-[13px] text-[#0071e3]"
        >
          <span aria-hidden>🔗</span>
          {copied ? t("collab.share.copied") : t("collab.share.copyLink")}
        </button>
      ) : viewerRole === "owner" ? (
        // 서버는 초대 토큰 해시만 저장해 옛 링크를 다시 보여줄 수 없다 —
        // 이전 링크가 없으면 재발급을 명시 버튼으로 받는다(n8a 리뷰 2).
        // 링크 발급은 소유자만 된다 — 편집자에게 보이면 누르는 순간 403이다.
        <button
          type="button"
          onClick={onReissue}
          disabled={busy}
          className="mb-2.5 flex cursor-pointer items-center gap-1.5 text-[13px] text-[#0071e3] disabled:cursor-default disabled:opacity-60"
        >
          <span aria-hidden>🔗</span>
          {t("collab.share.createLink")}
        </button>
      ) : null}

      <div className="flex flex-col">
        {members.map((member) => (
          <MemberMenu
            key={member.id}
            member={member}
            viewerRole={viewerRole}
            disabled={busy}
            onRemove={onRemove}
            onReissue={onReissue}
            onUnshare={onUnshare}
            onLeave={onLeave}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
