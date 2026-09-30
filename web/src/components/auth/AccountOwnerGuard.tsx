"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/Provider";
import { useAuth } from "@/state/auth";
import { useStorage } from "@/state/storage";

/**
 * 이 기기 로컬 데이터의 주인(`settings.ownerUserId`)을 판정한다 (D5-2).
 * - 기록이 없으면 지금 로그인한 계정으로 한 번 기록한다(claim).
 * - 기록이 있고 지금 계정과 다르면 안내 카드를 띄운다. 로그아웃하거나 계속한다.
 */
export type LocalOwnerVerdict = "claim" | "match" | "mismatch";

export function resolveLocalOwner(
  storedOwnerId: string | null | undefined,
  userId: string,
): LocalOwnerVerdict {
  if (storedOwnerId == null || storedOwnerId === "") return "claim";
  if (storedOwnerId === userId) return "match";
  return "mismatch";
}

export function AccountOwnerGuard() {
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.user?.id ?? null);
  const initialized = useStorage((s) => s.initialized);
  const ownerId = useStorage((s) => s.settings?.ownerUserId ?? null);
  const [dismissed, setDismissed] = useState(false);

  const active = status === "authenticated" && userId !== null && initialized;
  const verdict = active && userId ? resolveLocalOwner(ownerId, userId) : "match";

  useEffect(() => {
    if (!active || !userId) return;
    if (resolveLocalOwner(ownerId, userId) === "claim") {
      void useStorage.getState().updateSettings({ ownerUserId: userId });
    }
  }, [active, ownerId, userId]);

  if (!active || verdict !== "mismatch" || dismissed) return null;
  return <ForeignAccountCard onContinue={() => setDismissed(true)} />;
}

/**
 * 다른 계정의 보드가 로컬에 남아 있을 때의 안내 카드. `SessionExpiredCard`와 같은 틀.
 * 로컬 저장소를 계정별로 나누는 일은 미룬 질문이라, 여기서는 경고만 하고 선택을 받는다.
 */
function ForeignAccountCard({ onContinue }: { onContinue: () => void }) {
  const t = useT();

  const handleLogout = () => {
    void useAuth.getState().logout();
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: "rgba(236,237,239,.35)" }}
      />
      <div
        role="dialog"
        aria-label={t("collab.auth.account.title")}
        className="relative w-[320px] rounded-[18px] bg-white/85 p-[26px_24px_20px] text-center shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h3 className="mb-1 text-[17px] font-semibold">
          {t("collab.auth.account.title")}
        </h3>
        <p className="text-[12px] text-[#8e8e93]">
          {t("collab.auth.account.body")}
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mx-auto mt-4 flex w-full items-center justify-center rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white"
        >
          {t("collab.auth.account.logout")}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="mx-auto mt-3 text-[13px] font-medium text-[#1d1d1f] underline"
        >
          {t("collab.auth.account.continue")}
        </button>
      </div>
    </div>
  );
}
