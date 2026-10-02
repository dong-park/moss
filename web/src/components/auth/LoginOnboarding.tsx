"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import type { Translator } from "@/i18n";
import { AuthRequestError, GoogleUnavailableError, useAuth } from "@/state/auth";
import { useOnlineStatus } from "@/state/network";
import { FloatingCards } from "./FloatingCards";
import { GoogleButton } from "./GoogleButton";

/**
 * 로그인 온보딩 — 로그인 전에는 워크스페이스 대신 이 화면만 보인다 (D5, AC-4).
 * 떠다니는 메모 카드 배경 위 가운데에 카피 한 줄과 Google 버튼 (첫 페이지 시안 A).
 * 그 아래 "메일로 계속"으로 메일 로그인 ↔ 가입 폼을 연다 (D11).
 * 로그인하면 게이트가 워크스페이스로 바뀌고 `usePathname`의 보드가 열린다 — P1:
 * 별도 `next` 전달·이동이 필요 없어 그 배선을 지웠다.
 */
type Mode = "closed" | "login" | "signup";
type FieldErrors = { email?: string; password?: string; name?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;
const NAME_MAX = 40;

/** 서버와 같은 규칙으로 보내기 전에 칸 아래 안내를 띄운다 (AC-6). */
function validate(
  mode: Mode,
  email: string,
  password: string,
  name: string,
  t: Translator,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = t("collab.auth.email.invalidEmail");
  // 서버는 코드포인트로 최소 길이를 본다 — UTF-16 length는 이모지를 2로 세어 어긋난다.
  // 로그인은 가입 정책의 최소 길이를 보지 않는다. 72바이트 상한은 둘 다 본다 — bcrypt가 그 이상을 못 받는다.
  if (mode === "login" && password.length === 0) {
    errors.password = t("collab.auth.email.passwordRequired");
  } else if (mode === "signup" && [...password].length < PASSWORD_MIN) {
    errors.password = t("collab.auth.email.passwordTooShort");
  } else if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    errors.password = t("collab.auth.email.passwordTooLong");
  }
  if (mode === "signup") {
    const trimmed = name.trim();
    if (trimmed.length === 0) errors.name = t("collab.auth.email.nameRequired");
    else if ([...trimmed].length > NAME_MAX) errors.name = t("collab.auth.email.nameTooLong");
  }
  return errors;
}

/** 서버가 준 문구를 우선하고, 없으면 상태 코드별 기본 문구로 대신한다. */
function errorMessage(err: unknown, t: Translator): string {
  if (err instanceof AuthRequestError) {
    if (err.status === 401) return err.message || t("collab.auth.email.loginFailed");
    if (err.status === 409) return err.message || t("collab.auth.email.conflict");
    if (err.status === 429) return err.message || t("collab.auth.email.rateLimited");
    if (err.status === 400) return err.message || t("collab.auth.email.failed");
  }
  return t("collab.auth.email.failed");
}

/**
 * 로그인 전 첫 화면: 떠다니는 메모 카드 위 가운데에 워드마크, 카피 한 줄, 로그인 버튼.
 * `context`: 초대 링크처럼 로그인 이유가 있을 때 워드마크 위에 한 줄로 보여 준다.
 */
export function LoginOnboarding({ context }: { context?: React.ReactNode } = {}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[var(--z-panel)] flex items-center justify-center bg-[var(--color-bg)]">
      <FloatingCards />
      <div
        role="dialog"
        aria-label={t("collab.auth.onboarding.title")}
        className="relative z-[1000] text-center text-[var(--color-text)]"
      >
        {/* 카피 뒤를 배경색으로 덮어 글이 카드에 묻히지 않게 한다 — 메일 폼이 열리면 같이 커진다 */}
        <div
          aria-hidden
          className="absolute -inset-x-[160px] -inset-y-[150px] -z-10"
          style={{
            background:
              "radial-gradient(closest-side, rgb(235 236 238 / 0.96) 68%, rgb(235 236 238 / 0))",
          }}
        />
        {context ? <div className="mb-4">{context}</div> : null}
        <div className="inline-flex items-center gap-[7px] text-[19px] font-bold tracking-[-0.02em]">
          <i aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent-lime)]" />
          moss
        </div>
        <h1 className="mb-7 mt-4 whitespace-pre-line text-[clamp(34px,4vw,58px)] font-bold leading-[1.16] tracking-[-0.035em]">
          {t("collab.auth.onboarding.title")}
        </h1>
        <div className="mx-auto w-[300px]">
          <LoginActions />
        </div>
      </div>
    </div>
  );
}

/**
 * Google 버튼 + "메일로 계속" 폼. 온보딩과 세션 만료 카드가 같이 쓴다 —
 * 만료 카드에 Google만 있으면 메일 계정은 다시 들어올 길이 없다.
 */
export function LoginActions() {
  const t = useT();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("closed");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleLogin = async () => {
    setBusy(true);
    setGoogleError(null);
    try {
      await useAuth.getState().loginWithGoogle();
    } catch (err) {
      // 실패를 삼키면 버튼이 아무 일도 안 하는 것처럼 보인다.
      setGoogleError(
        err instanceof GoogleUnavailableError ? err.message : t("collab.auth.email.failed"),
      );
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!online) return;
    const found = validate(mode, email, password, name, t);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        await useAuth.getState().signupWithEmail(email.trim(), password, name.trim());
      } else {
        await useAuth.getState().loginWithEmail(email.trim(), password);
      }
    } catch (err) {
      setFormError(errorMessage(err, t));
      setBusy(false);
    }
  };

  const disabled = busy || !online;

  return (
    <>
      <GoogleButton onClick={handleLogin} disabled={disabled} />
      {googleError && (
        <p role="alert" className="mt-1.5 text-[11px] text-[#c0392b]">
          {googleError}
        </p>
      )}

      {mode === "closed" ? (
        <button
          type="button"
          onClick={() => switchMode("login")}
          className="mt-2 text-[12px] text-[#2c2e33] underline"
        >
          {t("collab.auth.email.continue")}
        </button>
      ) : (
        <form onSubmit={submit} noValidate className="mt-3 space-y-2 text-left">
          <div>
            <label htmlFor="moss-auth-email" className="text-[11px] text-[#8e8e93]">
              {t("collab.auth.email.emailLabel")}
            </label>
            <input
              id="moss-auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? true : undefined}
              className="mt-0.5 w-full rounded-[8px] border border-black/10 bg-white px-2 py-1.5 text-[13px]"
            />
            {errors.email && (
              <p role="alert" className="mt-0.5 text-[11px] text-[#c0392b]">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="moss-auth-password" className="text-[11px] text-[#8e8e93]">
              {t("collab.auth.email.passwordLabel")}
            </label>
            <input
              id="moss-auth-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={errors.password ? true : undefined}
              className="mt-0.5 w-full rounded-[8px] border border-black/10 bg-white px-2 py-1.5 text-[13px]"
            />
            {errors.password && (
              <p role="alert" className="mt-0.5 text-[11px] text-[#c0392b]">
                {errors.password}
              </p>
            )}
          </div>

          {mode === "signup" && (
            <div>
              <label htmlFor="moss-auth-name" className="text-[11px] text-[#8e8e93]">
                {t("collab.auth.email.nameLabel")}
              </label>
              <input
                id="moss-auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                className="mt-0.5 w-full rounded-[8px] border border-black/10 bg-white px-2 py-1.5 text-[13px]"
              />
              {errors.name && (
                <p role="alert" className="mt-0.5 text-[11px] text-[#c0392b]">
                  {errors.name}
                </p>
              )}
            </div>
          )}

          {formError && (
            <p role="alert" className="text-[11px] text-[#c0392b]">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="w-full rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {mode === "signup"
              ? t("collab.auth.email.signupButton")
              : t("collab.auth.email.loginButton")}
          </button>

          <button
            type="button"
            onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
            className="w-full text-center text-[11px] text-[#2c2e33] underline"
          >
            {mode === "signup"
              ? t("collab.auth.email.toLogin")
              : t("collab.auth.email.toSignup")}
          </button>
        </form>
      )}

      {!online && (
        <p role="alert" className="mt-2 text-[11px] text-[#9a9ca2]">
          {t("collab.auth.email.offline")}
        </p>
      )}
    </>
  );
}
