"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  GoogleUnavailableError,
  InviteExpiredError,
  InviteFullError,
  SessionExpiredError,
  useAuth,
} from "@/state/auth";
import type { BoardSummary, InvitePreview } from "@/state/auth/types";
import { GoogleButton } from "./GoogleButton";

type Phase = "idle" | "checking" | "joining" | "expired" | "full" | "error";

function initial(name: string): string {
  return name.trim().slice(0, 1) || "?";
}

/**
 * `/j/[token]` 초대 수락 화면. 시안 v3 ⑤.
 *
 * 카드 이름은 무인증 `POST /invites/preview`가 돌려준 값만 쓴다 — 쿼리 파라미터는
 * 신뢰하지 않는다(스푸핑). 로그인돼 있어도 자동 수락하지 않고 "참여하기" 1탭을 받는다.
 */
export function InviteRoute({
  token,
  onJoined,
}: {
  token: string;
  onJoined?: (board: BoardSummary) => void;
}) {
  const t = useT();
  const session = useAuth((s) => s.session);
  const status = useAuth((s) => s.status);
  const [phase, setPhase] = useState<Phase>("checking");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [board, setBoard] = useState<BoardSummary | null>(null);
  const startedRef = useRef(false);

  const openBoard = useCallback(
    (joined: BoardSummary) => {
      if (onJoined) onJoined(joined);
      // n5 AC-11: 수락한 보드의 `/b/[boardId]`로 replace한다 — 토큰 주소가
      // 방문 기록에 남지 않는다(D7).
      else window.location.replace(`/b/${joined.id}`);
    },
    [onJoined],
  );

  const mapError = useCallback((err: unknown): Phase => {
    if (err instanceof InviteExpiredError) return "expired";
    if (err instanceof InviteFullError) return "full";
    if (err instanceof SessionExpiredError || err instanceof GoogleUnavailableError) return "idle";
    return "error";
  }, []);

  // 수락 경로는 하나 — startedRef가 중복 수락을 막는다.
  const join = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("joining");
    try {
      const joined = await useAuth.getState().acceptInvite(token);
      setBoard(joined);
      openBoard(joined);
    } catch (err) {
      startedRef.current = false;
      setPhase(mapError(err));
    }
  }, [token, openBoard, mapError]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useAuth.getState().hydrate();
      if (cancelled) return;
      try {
        const next = await useAuth.getState().previewInvite(token);
        if (cancelled) return;
        setPreview(next);
        setPhase("idle");
      } catch (err) {
        if (cancelled) return;
        // 410은 재발급으로 무효화된 링크 — 로그인시키지 않고 만료를 보여준다 (AC-6).
        // 그 밖의 미리보기 실패(오프라인·5xx·env 누락)는 참여를 막지 않는다 —
        // 이름은 fallback을 쓰고 버튼은 유지한다.
        setPhase(err instanceof InviteExpiredError ? "expired" : "idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, mapError]);

  // Google 로그인은 로그인까지만 — 수락은 "참여하기" 탭에서 일어난다 (동의 지점).
  const handleGoogle = useCallback(async () => {
    setPhase("joining");
    try {
      await useAuth.getState().loginWithGoogle();
      setPhase("idle");
    } catch (err) {
      setPhase(mapError(err));
    }
  }, [mapError]);

  const retry = useCallback(() => {
    startedRef.current = false;
    const state = useAuth.getState();
    if (state.session && state.status !== "expired") void join();
    else void handleGoogle();
  }, [join, handleGoogle]);

  const ownerName = board?.ownerName ?? preview?.ownerName;
  const boardName =
    board?.name ?? preview?.boardName ?? t("collab.auth.invite.boardFallback");

  // status가 expired면 session이 남아 있어도 재로그인 버튼을 보여준다.
  const showGoogle = phase === "idle" && (!session || status === "expired");
  const showJoin = phase === "idle" && session !== null && status !== "expired";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: "rgba(236,237,239,.35)" }}
      />
      <div
        role="dialog"
        aria-label={t("collab.auth.invite.title")}
        className="relative w-[300px] rounded-[18px] bg-white/85 p-[26px_24px_20px] text-center shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <div
          className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white"
          style={{ background: "var(--color-accent-purple, #b8a8c4)" }}
        >
          {ownerName ? initial(ownerName) : "?"}
        </div>
        {ownerName ? (
          <p className="mb-1 text-[12px] text-[#8e8e93]">
            {t("collab.auth.invite.ownerInvite", { name: ownerName })}
          </p>
        ) : null}
        <h3 className="mb-1 text-[17px] font-semibold">{boardName}</h3>

        {showGoogle ? <GoogleButton onClick={handleGoogle} /> : null}
        {showJoin ? (
          <button
            type="button"
            onClick={join}
            className="mx-auto mt-4 flex w-full items-center justify-center rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white"
          >
            {t("collab.auth.invite.join")}
          </button>
        ) : null}
        {phase === "checking" || phase === "joining" ? (
          <p className="mt-4 text-[12px] text-[#8e8e93]">{t("collab.auth.invite.checking")}</p>
        ) : null}
        {phase === "expired" ? (
          <p className="mt-3 text-[13px] font-medium text-[#8e8e93]">
            {t("collab.auth.invite.expired")}
            <span className="mt-1 block text-[12px] font-normal">
              {t("collab.auth.invite.expiredHint")}
            </span>
          </p>
        ) : null}
        {phase === "full" ? (
          <p className="mt-3 text-[13px] font-medium text-[#8e8e93]">
            {t("collab.auth.invite.full")}
          </p>
        ) : null}
        {phase === "error" ? (
          <>
            <p className="mt-3 text-[13px] font-medium text-[#8e8e93]">
              {t("collab.auth.invite.error")}
            </p>
            <button
              type="button"
              onClick={retry}
              className="mx-auto mt-3 text-[13px] font-medium text-[#1d1d1f] underline"
            >
              {t("collab.auth.invite.retry")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
