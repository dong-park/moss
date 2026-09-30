"use client";

import { useT } from "@/i18n/Provider";
import { useAuth } from "@/state/auth";
import { LoginActions } from "./LoginOnboarding";

/**
 * 리프레시 토큰이 만료됐을 때 보드 위에 뜨는 로그인 카드 (AC-12).
 * 로컬 사본은 건드리지 않는다 — 로그인하면 보던 자리 그대로 돌아온다.
 */
export function AuthSessionOverlay() {
  const t = useT();
  const status = useAuth((s) => s.status);

  if (status !== "expired") return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: "rgba(236,237,239,.35)" }}
      />
      <div
        role="dialog"
        aria-label={t("collab.auth.expired.title")}
        className="relative w-[300px] rounded-[18px] bg-white/85 p-[26px_24px_20px] text-center shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h3 className="mb-1 text-[17px] font-semibold">
          {t("collab.auth.expired.title")}
        </h3>
        <p className="text-[12px] text-[#8e8e93]">{t("collab.auth.expired.body")}</p>
        <LoginActions />
      </div>
    </div>
  );
}
