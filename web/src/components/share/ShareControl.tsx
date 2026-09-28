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
import { ShareIcon } from "./ShareIcon";
import { SharePopover } from "./SharePopover";

export interface ShareControlProps {
  boardId: string;
  boardName: string;
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
 * 시안 v3 ①~③ — 우상단 공유 아이콘·아바타·팝오버를 묶은 진입점.
 * 로그인은 공유를 시작할 때만 묻는다 (D8).
 */
export function ShareControl({
  boardId,
  boardName,
  members,
  role: roleProp,
  onStartShare,
  onLeaveBoard,
}: ShareControlProps) {
  // 역할을 모르면 소유자로 단정하지 않는다(fail-closed) — 소유자 전용 메뉴는 role === "owner" 일 때만 보인다.
  const role: MemberRole = roleProp ?? "editor";
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const status = useShare((s) => s.byBoard[boardId]?.status ?? "local");
  const inviteToken = useShare((s) => s.byBoard[boardId]?.inviteToken ?? null);
  const busy = useShare((s) => s.busyByBoard[boardId] ?? false);
  const error = useShare((s) => s.errorByBoard[boardId] ?? null);
  const setBoardError = useShare((s) => s.setBoardError);

  const session = useAuth((s) => s.session);
  const authStatus = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  const authenticated = session !== null && authStatus !== "expired";
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
    if (error) setBoardError(boardId, null);
    setOpen((v) => !v);
  };

  // n7: 서버 공유 행(멤버 포함)을 먼저 만든 뒤 업로드 훅을 부른다 — 보드 토큰
  // 발급이 멤버 확인을 요구하므로 순서가 뒤집히면 연결이 403으로 실패한다.
  const beginShare = useCallback(async () => {
    try {
      await useShare.getState().startShare(boardId, boardName);
    } catch {
      /* 오류 문구는 store.error가 들고 있다 */
      return;
    }
    onStartShare?.(boardId);
  }, [boardId, boardName, onStartShare]);

  const handleGoogle = useCallback(async () => {
    // 클릭 즉시 busy — 동의 창을 기다리는 동안 두 번 눌러도 공유가 두 번 시작되지 않는다.
    useShare.getState().setBoardBusy(boardId, true);
    try {
      await useAuth.getState().loginWithGoogle();
    } catch {
      useShare.getState().setBoardBusy(boardId, false);
      return;
    }
    await beginShare();
  }, [boardId, beginShare]);

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

      <button
        type="button"
        aria-label={t("collab.share.aria")}
        aria-expanded={open}
        onClick={toggle}
        className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-white/70 text-text shadow-[0_0_0_.5px_rgba(0,0,0,.08)] transition-colors hover:bg-white"
      >
        <ShareIcon />
      </button>

      {open ? (
        <SharePopover
          boardName={boardName}
          status={status}
          viewerRole={role}
          members={shownMembers}
          inviteUrl={invitePath}
          authenticated={authenticated}
          busy={busy}
          error={error}
          copied={copied}
          onGoogle={() => void handleGoogle()}
          onStart={() => void beginShare()}
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
