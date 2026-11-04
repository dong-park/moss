"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useT } from "@/i18n/Provider";
import { AuthRequestError, realAuthApi } from "@/state/auth/api";

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

function ResetForm() {
  const t = useT();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError(t("collab.auth.email.resetMissing"));
      return;
    }
    if ([...password].length < PASSWORD_MIN) {
      setError(t("collab.auth.email.passwordTooShort"));
      return;
    }
    if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
      setError(t("collab.auth.email.passwordTooLong"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await realAuthApi.confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof AuthRequestError && err.message
          ? err.message
          : t("collab.auth.email.resetInvalid"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[18px] font-medium">{t("collab.auth.email.resetTitle")}</h1>
      {done ? (
        <p role="status" className="mt-4 text-[13px]">
          {t("collab.auth.email.resetDone")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 space-y-2">
          <label htmlFor="moss-reset-password" className="text-[11px] text-[#8e8e93]">
            {t("collab.auth.email.passwordLabel")}
          </label>
          <input
            id="moss-reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[8px] border border-black/10 bg-white px-2 py-1.5 text-[13px]"
          />
          {error && (
            <p role="alert" className="text-[11px] text-[#c0392b]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {t("collab.auth.email.resetButton")}
          </button>
        </form>
      )}
    </main>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
