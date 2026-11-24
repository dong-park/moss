"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { useAuth } from "@/state/auth";
import { ShareStartError, useShare } from "@/state/share";
import { shareFirstWall } from "@/state/share/firstWall";
import { useStorage } from "@/state/storage";
import { useWorkspace } from "@/state/workspace";
import type { Board } from "@/state/db/schema";

/** 시트가 보여 주는 실패 이유. `offline`은 서버를 부르지 않고 시트가 직접 정한다. */
type SheetFailure =
  | "login"
  | "share"
  | "account"
  | "serverRowLeft"
  | "contentMoved"
  | "contentUnconfirmed"
  | "timeout"
  | "rejected"
  | "elsewhere"
  | "offline";

/**
 * 이 벽 안에 있고 아직 서버에 없는 파일함 수. 공유가 시작되면 `shareSubBoards`가 함께 올린다.
 * 이미 공유 중인 파일함과 다른 사람의 보드(`remote`)는 세지 않는다 — 올라가는 일이 아니다.
 */
export function countSubBoards(
  boards: Board[],
  rootId: string,
  isShared: (boardId: string) => boolean,
): number {
  const children = new Map<string, Board[]>();
  for (const b of boards) {
    if (!b.parentBoardId) continue;
    const list = children.get(b.parentBoardId) ?? [];
    list.push(b);
    children.set(b.parentBoardId, list);
  }
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  let count = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      queue.push(child.id);
      if (!child.remote && !isShared(child.id)) count += 1;
    }
  }
  return count;
}

/**
 * 던져진 오류를 시트가 말할 이유로 바꾼다. 정리하지 못한 것이 있으면 그것이 먼저다 —
 * 내용이 새 벽에 있다는 사실이 가장 중요하고, 그다음이 서버에 남은 기록이다.
 */
function failureOf(err: unknown): SheetFailure {
  if (!(err instanceof ShareStartError)) return "share";
  if (err.contentNotRestored) return "contentMoved";
  if (err.serverRowLeft) return "serverRowLeft";
  // 서버가 거절한 것은 "확인하지 못했다"가 아니라 "받지 않았다"다 — 거절 문구가 먼저다.
  // 응답이 늦은 것(timeout)은 받았는지 모르는 것이라 아래 contentUnconfirmed 가 맞게 말한다.
  if (err.uploadFailure === "rejected") return "rejected";
  if (err.contentUnconfirmed) return "contentUnconfirmed";
  if (err.reason === "elsewhere") return "elsewhere";
  if (err.uploadFailure) return err.uploadFailure;
  if (err.reason === "login") return "login";
  if (err.reason === "account") return "account";
  return "share";
}

export interface ShareSheetProps {
  boardId: string;
  boardName: string;
  /**
   * 첫 벽(시스템 보드)이다. 고정 id라 그대로는 올릴 수 없어서, 주 버튼이 같은 내용을 새 벽으로
   * 옮겨 그 벽을 공유한다. 시트는 이 사실을 한 줄 더 알린다. `onShared`는 새 벽 id로 불린다.
   */
  firstWall?: boolean;
  /** 취소·Esc·바깥 누름으로 닫을 때. 서버에는 아무것도 보내지 않는다. */
  onClose: () => void;
  /** 서버가 벽 내용을 받은 뒤. 시트는 이어서 닫힌다. */
  onShared: (boardId: string) => void;
}

/**
 * 시안 06 — 공유하면 이 벽이 서버에 올라간다는 사실을 먼저 알리는 가운데 시트.
 * 로그인은 이 시트의 주 버튼에서만 받는다. 버튼은 로그인 상태에 따라 문구만 다르고
 * 같은 동작(`startShare` + 로그인 허용)을 부른다. 실패하면 이유를 말하고 벽은 이 기기에 남는다.
 * 부모는 열릴 때만 이 컴포넌트를 그린다 — 실패 문구는 열 때마다 비어 있다.
 */
export function ShareSheet({ boardId, boardName, firstWall = false, onClose, onShared }: ShareSheetProps) {
  const t = useT();
  const signedIn = useAuth((s) => s.status === "authenticated");
  const storeBusy = useShare((s) => s.busyByBoard[boardId] ?? false);
  const boards = useWorkspace((s) => s.boards);
  const byBoard = useShare((s) => s.byBoard);
  // 주인 기록이 없는 기기의 첫 벽 — 로그인 전에 쓴 메모가 모두 올라간다. 한 번 더 확인받는다.
  // 세션이 복원돼 주인이 곧바로 기록된 기기는 기록 시점에 익명 메모가 있었다는 표시로 안다.
  const ownerUnknown = useStorage((s) => s.initialized && !s.settings?.ownerUserId);
  const anonymousAtClaim = useStorage((s) => s.settings?.anonymousDataAtClaim === true);
  const [anonymousConfirmed, setAnonymousConfirmed] = useState(false);
  // 확인한 뒤에도 안내 줄은 남겨 둔다 — 표시를 지워도 문구가 사라지지 않게.
  const needsAnonymousConfirm =
    firstWall && (ownerUnknown || anonymousAtClaim || anonymousConfirmed);

  const [failure, setFailure] = useState<SheetFailure | null>(null);
  /** `contentMoved`일 때 내용이 남은 새 벽. */
  const [contentBoardId, setContentBoardId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const busy = submitting || storeBusy;
  const folderCount = countSubBoards(boards, boardId, (id) => byBoard[id]?.status === "shared");

  // 내용을 되돌리지 못했다 — 다시 시도하면 남은 것으로 또 새 벽을 만든다. 내용이 있는 벽으로 보낸다.
  const goToContentWall = () => {
    if (!contentBoardId) return;
    void useWorkspace.getState().navigateToBoard(contentBoardId);
    onClose();
  };

  // 이 기기의 벽이 다른 계정의 것이라 멈췄다 — 같은 계정으로 다시 시도해도 같은 이유로 멈춘다.
  // 로그아웃해서 원래 계정으로 들어오게 한다. 실패 문구는 비워 로그인해 공유하는 버튼이 다시 보인다.
  const logoutAndReset = async () => {
    await useAuth.getState().logout();
    if (mountedRef.current) setFailure(null);
  };

  const close = () => {
    // 올리는 중에는 닫지 않는다 — 취소를 눌러도 이미 시작된 업로드는 멈추지 않는다.
    if (busy) return;
    onClose();
  };

  // 기록 시점의 익명 메모 표시를 지운다. 공유가 끝난 뒤에만 부른다 — 확인만 누르고 닫거나
  // 업로드가 실패하면 표시가 남아, 다음 시트가 다시 확인을 받는다.
  const clearAnonymousMark = () => {
    if (useStorage.getState().settings?.anonymousDataAtClaim === true) {
      void useStorage.getState().updateSettings({ anonymousDataAtClaim: false });
    }
  };

  const share = async () => {
    if (submittingRef.current || useShare.getState().busyByBoard[boardId]) return;
    if (needsAnonymousConfirm && !anonymousConfirmed) {
      // 이 시트 안의 상태만 바꾼다. 표시는 공유가 끝날 때 지운다.
      setAnonymousConfirmed(true);
      return;
    }
    // 오프라인에서는 로그인 창도 서버도 부르지 않는다.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFailure("offline");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setFailure(null);
    // 첫 벽은 새 벽으로 옮겨 올라가므로 공유되는 벽의 id가 다르다.
    let sharedId = boardId;
    try {
      if (firstWall) sharedId = await shareFirstWall();
      else await useShare.getState().startShare(boardId, boardName, { login: true });
    } catch (err) {
      if (mountedRef.current) {
        setFailure(failureOf(err));
        setContentBoardId(err instanceof ShareStartError ? (err.contentBoardId ?? null) : null);
      }
      return;
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
    // 다른 호출이 이미 진행 중이라 startShare 가 바로 돌아온 경우는 성공이 아니다.
    if (useShare.getState().byBoard[sharedId]?.status === "shared") {
      // 시트에서 로그인하며 주인이 기록된 경우처럼 확인 뒤에 표시가 생긴 기기도 여기서 함께 지운다.
      if (firstWall) clearAnonymousMark();
      onShared(sharedId);
    }
  };

  const confirming = needsAnonymousConfirm && !anonymousConfirmed;
  const retrying =
    failure === "share" ||
    failure === "serverRowLeft" ||
    failure === "contentUnconfirmed" ||
    failure === "timeout" ||
    failure === "rejected" ||
    failure === "elsewhere";
  const primaryLabel = confirming
    ? t("collab.share.sheet.confirmAnonymous")
    : retrying
      ? t("collab.share.sheet.retry")
      : signedIn
        ? t("collab.share.sheet.share")
        : t("collab.share.sheet.loginAndShare");

  const failureTexts: Record<SheetFailure, string> = {
    login: t("collab.share.sheet.loginFailed"),
    share: t("collab.share.sheet.shareFailed"),
    account: t("collab.share.sheet.accountMismatch"),
    serverRowLeft: t("collab.share.sheet.serverRowLeft"),
    contentMoved: t("collab.share.sheet.contentMoved"),
    contentUnconfirmed: t("collab.share.sheet.contentUnconfirmed"),
    timeout: t("collab.share.sheet.uploadTimeout"),
    rejected: t("collab.share.sheet.uploadRejected"),
    elsewhere: t("collab.share.sheet.elsewhere"),
    offline: t("collab.auth.email.offline"),
  };
  const failureText = failure ? failureTexts[failure] : null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-[rgba(30,30,30,.28)]" />
        <Dialog.Content
          aria-describedby="share-sheet-body"
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-7 shadow-[0_30px_60px_-20px_rgba(0,0,0,.45)] focus:outline-none"
        >
          <Dialog.Title className="mb-3.5 text-[20px] font-extrabold text-[#1f2430]">
            {t("collab.share.sheet.title")}
          </Dialog.Title>

          <div
            id="share-sheet-body"
            className="flex gap-3 rounded-xl bg-[#f6f5f1] p-3.5"
          >
            <div aria-hidden className="text-[26px]">
              ☁️
            </div>
            <div className="text-[15px] leading-[1.55] text-[#333]">
              <p>
                {t("collab.share.sheet.lead")} <b>{t("collab.share.sheet.strong")}</b>
                <br />
                {t("collab.share.sheet.rest")}
              </p>
              {firstWall ? (
                <p data-testid="share-sheet-first-wall" className="mt-1.5">
                  {t("collab.share.sheet.firstWall")}
                </p>
              ) : null}
              {needsAnonymousConfirm ? (
                <p data-testid="share-sheet-anonymous" className="mt-1.5 font-semibold">
                  {t("collab.share.sheet.anonymousData")}
                </p>
              ) : null}
              {folderCount > 0 ? (
                <p data-testid="share-sheet-folders" className="mt-1.5">
                  {t("collab.share.sheet.folders", { count: folderCount })}
                </p>
              ) : null}
            </div>
          </div>

          {failureText ? (
            <p role="alert" className="mt-3 text-[13px] text-red-600">
              {failureText}
            </p>
          ) : null}

          {busy ? (
            <p role="status" className="mt-3 text-center text-[13px] text-[#666]">
              {t("collab.share.sheet.uploading")}
            </p>
          ) : null}

          {failure === "contentMoved" && contentBoardId ? (
            <button
              type="button"
              onClick={goToContentWall}
              className="mt-4 block w-full cursor-pointer rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-center text-[13px] font-medium text-white"
            >
              {t("collab.share.sheet.goToWall")}
            </button>
          ) : failure === "account" ? (
            <button
              type="button"
              onClick={() => void logoutAndReset()}
              className="mt-4 block w-full cursor-pointer rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-center text-[13px] font-medium text-white"
            >
              {t("collab.auth.account.logout")}
            </button>
          ) : signedIn ? (
            <button
              type="button"
              onClick={() => void share()}
              disabled={busy}
              className="mt-4 block w-full cursor-pointer rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-center text-[13px] font-medium text-white disabled:cursor-default disabled:opacity-60"
            >
              {primaryLabel}
            </button>
          ) : (
            <GoogleButton onClick={() => void share()} disabled={busy} label={primaryLabel} />
          )}
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="mt-2 block w-full cursor-pointer rounded-[10px] bg-[#f0f0ee] px-4 py-2.5 text-center text-[13px] font-medium text-[#333] disabled:cursor-default disabled:opacity-60"
          >
            {t("collab.share.sheet.cancel")}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
