"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import { useAuth } from "@/state/auth";
import { GoogleButton } from "./GoogleButton";

/**
 * 로그인 온보딩 — 로그인 전에는 워크스페이스 대신 이 카드만 보인다 (D5, AC-4).
 * 캔버스 배경 위 가운데 카드 하나: 제목 한 줄, 소개 한 줄, 기능 3개, Google 버튼.
 * 로그인하면 게이트가 워크스페이스로 바뀌고 `usePathname`의 보드가 열린다 — P1:
 * 별도 `next` 전달·이동이 필요 없어 그 배선을 지웠다.
 */
export function LoginOnboarding() {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setBusy(true);
    try {
      await useAuth.getState().loginWithGoogle();
    } catch {
      // 실패하면 온보딩을 남긴다.
      setBusy(false);
    }
  };

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
        <GoogleButton onClick={handleLogin} disabled={busy} />
        <p className="mt-2 text-[11px] text-[#9a9ca2]">
          {t("collab.auth.onboarding.loginHint")}
        </p>
      </div>
    </div>
  );
}
