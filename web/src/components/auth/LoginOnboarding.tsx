"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import type { Translator } from "@/i18n";
import { AuthRequestError, useAuth } from "@/state/auth";
import { useOnlineStatus } from "@/state/network";
import { GoogleButton } from "./GoogleButton";

/**
 * 로그인 온보딩 — 로그인 전에는 워크스페이스 대신 이 카드만 보인다 (D5, AC-4).
 * 캔버스 배경 위 가운데 카드 하나: 제목 한 줄, 소개 한 줄, 기능 3개, Google 버튼.
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
  // 로그인은 가입 정책의 최소 길이를 보지 않는다 — 서버 validateLoginPassword와 같다.
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

export function LoginOnboarding() {
  const t = useT();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("closed");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleLogin = async () => {
    setBusy(true);
    try {
      await useAuth.getState().loginWithGoogle();
    } catch {
      // 실패하면 온보딩을 남긴다.
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
    <div className="fixed inset-0 z-[var(--z-panel)] flex items-center justify-center bg-[var(--color-bg)]">
      <div
        role="dialog"
        aria-label={t("collab.auth.onboarding.title")}
        className="w-[320px] rounded-[18px] bg-white/85 p-[26px_24px_20px] text-center shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h1 className="mb-1 text-[18px] font-semibold">
          {t("collab.auth.onboarding.title")}
        </h1>
        <p className="text-[12px] text-[#8e8e93]">
          {t("collab.auth.onboarding.intro")}
        </p>
        <ul className="mt-4 space-y-1.5 text-left text-[12px] text-[#2c2e33]">
          <li>{t("collab.auth.onboarding.feature1")}</li>
          <li>{t("collab.auth.onboarding.feature2")}</li>
          <li>{t("collab.auth.onboarding.feature3")}</li>
        </ul>
        <GoogleButton onClick={handleLogin} disabled={disabled} />

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
                className="mt-0.5 w-full rounded-[8px] border border-black/10 px-2 py-1.5 text-[13px]"
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
                className="mt-0.5 w-full rounded-[8px] border border-black/10 px-2 py-1.5 text-[13px]"
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
                  className="mt-0.5 w-full rounded-[8px] border border-black/10 px-2 py-1.5 text-[13px]"
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

        <p className="mt-2 text-[11px] text-[#9a9ca2]">
          {t("collab.auth.onboarding.loginHint")}
        </p>
      </div>
    </div>
  );
}
