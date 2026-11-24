"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import { useAuth } from "@/state/auth";
import {
  absoluteInviteUrl,
  buildInvitePath,
  useShare,
  type BoardMember,
  type MemberRole,
} from "@/state/share";
import { MemberAvatarRow } from "./MemberAvatar";
import { SharePopover } from "./SharePopover";
import { ShareSheet } from "./ShareSheet";
import { WallBadge } from "./WallBadge";

export interface ShareControlProps {
  boardId: string;
  boardName: string;
  /** 첫 벽(시스템 보드) — 공유하면 새 벽으로 옮겨 올라간다. 시트가 그 사실을 한 줄 더 알린다. */
  firstWall?: boolean;
  /** awareness(n7)·계정 목록이 넘기는 참여자. 없으면 공유 시작 후 소유자만 보인다. */
  members?: BoardMember[];
  /** 현재 사용자의 역할. n9의 `/me/boards`가 넘기기 전까지는 소유자로 본다. */
  role?: MemberRole;
  // TODO(n7): 이 보드의 Y.Doc을 서버에 올리는 훅을 주입한다. 지금은 기본 no-op.
  onStartShare?: (boardId: string) => void;
  // TODO(n9): 편집자 나가기 — 이 기기의 로컬 사본을 지운다. 지금은 기본 no-op.
  onLeaveBoard?: (boardId: string) => void;
}

/**
 * 시안 06 — 우상단 배지(🔒/☁)와 "공유 ↗" 버튼, 아바타, 시트·팝오버를 묶은 진입점.
 * 배지는 n2의 벽 공유 상태를 읽는다. 공유 전에는 가운데 시트가 서버에 올라간다는 사실을
 * 알리고, 로그인은 그 시트의 주 버튼에서만 받는다. 공유가 시작된 뒤에는 팝오버가 열린다.
 */
export function ShareControl({
  boardId,
  boardName,
  firstWall = false,
  members,
  role: roleProp,
  onStartShare,
  onLeaveBoard,
}: ShareControlProps) {
  // 역할을 모르면 소유자로 단정하지 않는다(fail-closed) — 소유자 전용 메뉴는 role === "owner" 일 때만 보인다.
  const role: MemberRole = roleProp ?? "editor";
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const status = useShare((s) => s.byBoard[boardId]?.status ?? "local");
  const inviteToken = useShare((s) => s.byBoard[boardId]?.inviteToken ?? null);
  const busy = useShare((s) => s.busyByBoard[boardId] ?? false);
  const error = useShare((s) => s.errorByBoard[boardId] ?? null);
  const setBoardError = useShare((s) => s.setBoardError);

  const user = useAuth((s) => s.user);

  const self: BoardMember | null = user
    ? { id: user.id, name: user.name, avatar: user.avatar, role }
    : null;
  const shownMembers = members ?? (status === "shared" && self ? [self] : []);
  const invitePath =
    inviteToken && self ? buildInvitePath(inviteToken, boardName, self.name) : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // Radix 드롭다운은 포털이라 컨테이너 밖이다 — 클릭을 팝오버 닫기로 오인하지 않는다.
      if (target?.closest("[data-radix-popper-content-wrapper]")) return;
      if (containerRef.current && !containerRef.current.contains(target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    // 아직 서버에 없는 벽은 시트가 먼저다. 공유 중(로그아웃 포함)이면 지금의 팝오버다.
    if (status !== "shared") {
      setSheetOpen(true);
      return;
    }
    if (error) setBoardError(boardId, null);
    setOpen((v) => !v);
  };

  // 서버가 벽 내용을 받은 뒤 — 시트를 닫고 링크 복사 팝오버를 연다. n7: 업로드 훅은 서버 행이
  // 만들어진 뒤에 부른다(보드 토큰 발급이 멤버 확인을 요구해 순서가 뒤집히면 403으로 실패한다).
  const handleShared = useCallback(
    (id: string) => {
      setSheetOpen(false);
      onStartShare?.(id);
      setOpen(true);
    },
    [onStartShare],
  );

  const handleCopy = useCallback(async () => {
    if (!invitePath) return;
    try {
      await navigator.clipboard?.writeText(absoluteInviteUrl(invitePath));
    } catch {
      /* 클립보드 미지원 환경 — 복사만 조용히 실패한다 */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [invitePath]);

  const handleReissue = useCallback(() => {
    void useShare.getState().reissueInvite(boardId).catch(() => {});
  }, [boardId]);

  const handleRemove = useCallback(
    (userId: string) => {
      void useShare.getState().removeMember(boardId, userId).catch(() => {});
    },
    [boardId],
  );

  const handleUnshare = useCallback(async () => {
    try {
      await useShare.getState().unshare(boardId);
    } catch {
      return;
    }
    setOpen(false);
  }, [boardId]);

  const handleLeave = useCallback(() => {
    onLeaveBoard?.(boardId);
    setOpen(false);
  }, [boardId, onLeaveBoard]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-3.5">
      {status === "shared" ? <MemberAvatarRow members={shownMembers} /> : null}

      <WallBadge
        boardId={boardId}
        action={
          <button
            type="button"
            aria-label={t("collab.share.aria")}
            aria-expanded={open}
            onClick={toggle}
            className="ml-1.5 cursor-pointer rounded-full bg-[#1f2430] px-2.5 py-[3px] text-[13px] font-semibold text-white transition-opacity hover:opacity-85"
          >
            {t("wall.share.button")}
          </button>
        }
      />

      {sheetOpen ? (
        <ShareSheet
          boardId={boardId}
          boardName={boardName}
          firstWall={firstWall}
          onClose={() => setSheetOpen(false)}
          onShared={handleShared}
        />
      ) : null}

      {open && status === "shared" ? (
        <SharePopover
          boardName={boardName}
          viewerRole={role}
          members={shownMembers}
          inviteUrl={invitePath}
          busy={busy}
          error={error}
          copied={copied}
          onCopy={() => void handleCopy()}
          onReissue={handleReissue}
          onRemove={handleRemove}
          onUnshare={() => void handleUnshare()}
          onLeave={handleLeave}
        />
      ) : null}
    </div>
  );
}
