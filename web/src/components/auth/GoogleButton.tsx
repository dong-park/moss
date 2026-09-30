"use client";

import { useT } from "@/i18n/Provider";

/**
 * Google Identity Services 로그인 버튼. 시안 v3의 검은 primary 버튼.
 * 실제 팝업은 state/auth의 GIS 래퍼가 띄운다.
 */
export function GoogleButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("collab.auth.googleAria")}
      className="mx-auto mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full"
        style={{
          background:
            "conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0)",
        }}
      />
      {t("collab.auth.google")}
    </button>
  );
}
