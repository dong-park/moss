"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import type { Translator } from "@/i18n";
import { AuthRequestError, useAuth } from "@/state/auth";
import { termsVersion } from "@/state/auth/terms";
import { useOnlineStatus } from "@/state/network";
import { GoogleSlot, type GoogleSlotStatus } from "./GoogleSlot";
import { TermsCheckbox } from "./TermsCheckbox";

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
    if (err.status === 503) return err.message || t("collab.auth.email.failed");
    if (err.status === 400) return err.message || t("collab.auth.email.failed");
  }
  return t("collab.auth.email.failed");
}

/**
 * Google 버튼 + "메일로 계속" 폼 (D11). 로그인 게이트는 없고(local-promise D7),
 * 초대 카드와 세션 만료 카드가 같이 쓴다 — Google만 있으면 메일 계정은 다시 들어올 길이 없다.
 */
export function LoginActions() {
  const t = useT();
  const online = useOnlineStatus();
  // 메일 요청 중. Google 요청과 같은 요청 잠금을 쓴다.
  const [mailBusy, setMailBusy] = useState(false);
  const [google, setGoogle] = useState<GoogleSlotStatus>({ locked: false, hideMail: false });
  const [mode, setMode] = useState<Mode>("closed");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const locked = mailBusy || google.locked;
  const disabled = locked || !online;

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!online || locked) return;
    const found = validate(mode, email, password, name, t);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    if (mode === "signup" && !accepted) {
      setFormError(t("collab.auth.email.termsRequired"));
      return;
    }
    setMailBusy(true);
    try {
      if (mode === "signup") {
        await useAuth.getState().signupWithEmail(email.trim(), password, name.trim(), termsVersion());
      } else {
        await useAuth.getState().loginWithEmail(email.trim(), password);
      }
    } catch (err) {
      setFormError(errorMessage(err, t));
      setMailBusy(false);
    }
  };


  return (
    <>
      <GoogleSlot online={online} mailBusy={mailBusy} onStatus={setGoogle} />

      {google.hideMail ? null : mode === "closed" ? (
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

          {mode === "signup" && <TermsCheckbox accepted={accepted} onChange={setAccepted} />}

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
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
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
