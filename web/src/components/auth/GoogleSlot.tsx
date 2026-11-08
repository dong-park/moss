"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  attachGoogleSignIn,
  AuthRequestError,
  decodeJwtPayload,
  GoogleClientIdMissingError,
  loadGis,
  useAuth,
} from "@/state/auth";
import { termsVersion } from "@/state/auth/terms";
import { TermsCheckbox } from "./TermsCheckbox";

/**
 * Google 칸의 상태 모델(스펙 「상태 모델」). 10상태를 하나의 값으로 둔다.
 * 토큰은 확인 중·가입 마무리·가입 보내는 중만 들고 있고, 그 밖으로 나가면 버린다.
 * 오프라인과 요청 잠금은 상태가 아니라 어느 상태 위에나 씌우는 덮개다.
 */
export type SlotPhase =
  | { kind: "unavailable" } // 클라이언트 ID 없음
  | { kind: "loading" } // 스크립트 받는 중. 오프라인이면 연결이 돌아올 때까지 미룬다
  | { kind: "loadFailed" } // 온라인인데 스크립트를 못 받음
  | { kind: "button" }
  | { kind: "verifying"; token: string } // 확인 중
  | { kind: "finish"; token: string } // 가입 마무리
  | { kind: "submitting"; token: string } // 가입 보내는 중
  | { kind: "closed" } // 가입 닫힘
  | { kind: "mismatch" }; // 약관 어긋남

interface SlotState {
  phase: SlotPhase;
  /** 화면마다 문구 하나 — 오류·안내는 상태 값과 같이 바뀐다. */
  notice: string | null;
}

export interface GoogleSlotStatus {
  /** 요청 잠금 — Google 요청이 나가 있다. */
  locked: boolean;
  /** 가입 마무리·보내는 중·닫힘·약관 어긋남 동안 메일 링크와 폼을 숨긴다. */
  hideMail: boolean;
}

function initialState(): SlotState {
  return {
    phase: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? { kind: "loading" } : { kind: "unavailable" },
    notice: null,
  };
}

function statusOf(phase: SlotPhase): GoogleSlotStatus {
  return {
    locked: phase.kind === "verifying" || phase.kind === "submitting",
    hideMail:
      phase.kind === "finish" || phase.kind === "submitting" || phase.kind === "closed" || phase.kind === "mismatch",
  };
}

function isOnlineNow(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function GoogleSlot({
  online,
  mailBusy,
  onStatus,
}: {
  online: boolean;
  /** 메일 요청이 나가 있다. 같은 요청 잠금을 쓴다. */
  mailBusy: boolean;
  onStatus: (status: GoogleSlotStatus) => void;
}) {
  const t = useT();
  const [state, setState] = useState<SlotState>(initialState);
  const [accepted, setAccepted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const { phase, notice } = state;

  // 토큰 콜백은 Google이 부르므로 최신 값을 ref로 읽는다.
  const phaseRef = useRef(phase);
  const coverRef = useRef({ offline: !online, mailBusy });
  const statusRef = useRef(onStatus);
  const sendRef = useRef<(token: string, signup: boolean) => Promise<void>>(async () => {});
  const wasOffline = useRef(false);

  const go = useCallback((next: SlotPhase, nextNotice: string | null = null) => {
    phaseRef.current = next;
    setState({ phase: next, notice: nextNotice });
    // 같은 이벤트 안에서 부모에 알려 메일 링크가 한 프레임도 어긋나 보이지 않게 한다.
    statusRef.current(statusOf(next));
  }, []);

  const requestLocked = phase.kind === "verifying" || phase.kind === "submitting";
  const locked = requestLocked || mailBusy;
  const covered = !online || locked;

  // 스크립트 받기 — 오프라인이면 미루고, 연결이 돌아오면 다시 받는다.
  useEffect(() => {
    if (phase.kind !== "loading") return;
    if (!online || !isOnlineNow()) return;
    let cancelled = false;
    loadGis().then(
      () => {
        if (!cancelled) go({ kind: "button" });
      },
      () => {
        if (cancelled) return;
        if (isOnlineNow()) go({ kind: "loadFailed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [phase.kind, online, attempt, go]);

  // 불러오기 실패 중 연결이 끊겼다 돌아오면 새로고침 없이 다시 받는다.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current && phaseRef.current.kind === "loadFailed") go({ kind: "loading" });
    wasOffline.current = false;
  }, [online, go]);

  const sendToServer = useCallback(
    async (token: string, signup: boolean) => {
      go(signup ? { kind: "submitting", token } : { kind: "verifying", token });
      try {
        await useAuth.getState().loginWithGoogle(token, signup ? termsVersion() : undefined);
      } catch (err) {
        const status = err instanceof AuthRequestError ? err.status : 0;
        const code = err instanceof AuthRequestError ? err.code : undefined;
        const failed = t("collab.auth.email.failed");
        if (status === 503) {
          go({ kind: "closed" });
        } else if (code === "consent_required") {
          if (signup) go({ kind: "mismatch" });
          else if (termsVersion()) go({ kind: "finish", token });
          else go({ kind: "closed" });
        } else if (signup) {
          if (status === 401) {
            setAccepted(false);
            go({ kind: "button" }, t("collab.auth.googleTokenExpired"));
          } else {
            go({ kind: "finish", token }, failed);
          }
        } else {
          go({ kind: "button" }, status === 401 && err instanceof Error && err.message ? err.message : failed);
        }
      }
    },
    [go, t],
  );

  useEffect(() => {
    phaseRef.current = phase;
    coverRef.current = { offline: !online || !isOnlineNow(), mailBusy };
    sendRef.current = sendToServer;
    statusRef.current = onStatus;
  });

  // 버튼 단계: Google 버튼을 칸에 그린다. 칸이 사라지면 떼고, 그 뒤 온 토큰은 버린다.
  const showHost = phase.kind === "button" || phase.kind === "verifying";
  useEffect(() => {
    const host = hostRef.current;
    if (!showHost || !host) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    const onToken = (token: string) => {
      const cover = coverRef.current;
      // 덮개가 있거나 버튼 단계가 아니면 버린다 — 요청이 2번 시작되지 않게.
      if (phaseRef.current.kind !== "button" || cover.offline || cover.mailBusy) return;
      void sendRef.current(token, false);
    };
    attachGoogleSignIn(host, { width: host.clientWidth, onToken }).then(
      (d) => {
        if (cancelled) d();
        else detach = d;
      },
      (err: unknown) => {
        if (cancelled || phaseRef.current.kind !== "button") return;
        if (err instanceof GoogleClientIdMissingError) go({ kind: "unavailable" });
        else go(isOnlineNow() ? { kind: "loadFailed" } : { kind: "loading" });
      },
    );
    return () => {
      cancelled = true;
      detach?.();
      host.replaceChildren();
    };
  }, [showHost, go]);

  // inert는 이미 들어간 포커스를 빼지 않는다. 덮개가 씌워질 때 Google 버튼에 남은 포커스를 뺀다.
  // 빼지 않으면 오프라인이나 요청 중에도 Enter가 Google 창을 연다.
  useEffect(() => {
    if (!covered) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && hostRef.current?.contains(active)) active.blur();
  }, [covered]);

  const retry = () => {
    if (locked || !online) return;
    setAttempt((n) => n + 1);
    go({ kind: "loading" });
  };

  const otherAccount = () => {
    if (locked) return;
    setAccepted(false);
    go({ kind: "button" });
  };

  const consent = () => {
    if (locked || !online || phase.kind !== "finish") return;
    if (!accepted) {
      go(phase, t("collab.auth.email.termsRequired"));
      return;
    }
    void sendToServer(phase.token, true);
  };

  // 오프라인이면 Google 칸 문구는 카드의 오프라인 안내 하나다.
  const noticeEl = notice && online ? (
    <p role="alert" className="mt-1.5 text-[11px] text-[#c0392b]">
      {notice}
    </p>
  ) : null;

  const linkClass = "mt-2 text-[12px] text-[#2c2e33] underline disabled:opacity-60 disabled:no-underline";

  if (phase.kind === "unavailable") {
    return <p className="mt-4 text-[12px] text-[#8e8e93]">{t("collab.auth.googleNoClient")}</p>;
  }

  if (phase.kind === "loadFailed" && online) {
    return (
      <div className="mt-4">
        <p className="text-[12px] text-[#8e8e93]">{t("collab.auth.googleLoadFailed")}</p>
        <button type="button" onClick={retry} disabled={locked} className={linkClass}>
          {t("collab.auth.googleRetry")}
        </button>
      </div>
    );
  }

  if (phase.kind === "finish" || phase.kind === "submitting") {
    const email = decodeJwtPayload(phase.token)?.email;
    return (
      <div className="mt-4 text-left">
        <p className="text-[11px] text-[#8e8e93]">{t("collab.auth.googleFinishHint")}</p>
        {email ? <p className="mb-2 break-all text-[13px] font-medium">{email}</p> : null}
        <TermsCheckbox accepted={accepted} onChange={setAccepted} />
        {noticeEl}
        <button
          type="button"
          onClick={consent}
          disabled={locked || !online}
          className="mt-2.5 w-full rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
        >
          {t("collab.auth.googleStart")}
        </button>
        <div className="text-center">
          <button type="button" onClick={otherAccount} disabled={locked} className={linkClass}>
            {t("collab.auth.googleOtherAccount")}
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === "closed" || phase.kind === "mismatch") {
    return (
      <div className="mt-4">
        <p className="text-[12px] text-[#2c2e33]">
          {phase.kind === "closed" ? t("collab.auth.googleSignupClosed") : t("collab.auth.googleTermsChanged")}
        </p>
        <button type="button" onClick={otherAccount} disabled={locked} className={linkClass}>
          {t("collab.auth.googleOtherAccount")}
        </button>
      </div>
    );
  }

  // loading · loadFailed(오프라인) · button · verifying — 자리표시가 같다.
  const placeholder = phase.kind === "loading" || phase.kind === "loadFailed" || covered;
  return (
    <div className="mt-4">
      <div data-testid="google-slot" className="relative">
        {showHost ? (
          // 덮개는 마우스만 막는다. inert가 Google iframe의 키보드 포커스까지 막는다.
          <div
            ref={hostRef}
            inert={placeholder}
            aria-hidden={placeholder || undefined}
            className="flex min-h-[40px] justify-center"
          />
        ) : (
          <div className="min-h-[40px]" />
        )}
        {placeholder ? (
          <div
            data-testid="google-slot-cover"
            className="absolute inset-0 cursor-default rounded-[4px] bg-[#d8d9dc]/70"
          />
        ) : null}
      </div>
      {noticeEl}
    </div>
  );
}
