"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/Provider";
import { useAuth } from "@/state/auth";
import { resolveLocalOwner } from "@/state/auth/localOwner";
import { getDB } from "@/state/db/schema";
import { useStorage } from "@/state/storage";

// 판정 자체는 `state/auth/localOwner.ts`에 있다 — 공유 시작도 같은 판정을 쓴다.
export { resolveLocalOwner, type LocalOwnerVerdict } from "@/state/auth/localOwner";

/**
 * 로그인하기 전에 쓴 메모가 이 기기에 있는가. 읽지 못하면 있다고 본다 — 확인을 한 번 더 받는 쪽이
 * 안전하다.
 */
async function hasAnonymousData(): Promise<boolean> {
  try {
    return (await getDB().notes.count()) > 0;
  } catch {
    return true;
  }
}

/**
 * 기록이 없으면 지금 로그인한 계정으로 한 번 기록한다(claim).
 * 기록할 때 익명 메모가 있었는지도 함께 남긴다 — 첫 벽 공유 시트가 그 메모가 올라간다는 확인을
 * 세션 복원 경로에서도 받게 한다.
 * 기록이 있고 지금 계정과 다르면 안내 카드를 띄운다. 로그아웃하거나 계속한다.
 */
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
      void (async () => {
        const anonymousDataAtClaim = await hasAnonymousData();
        await useStorage.getState().updateSettings({ ownerUserId: userId, anonymousDataAtClaim });
      })();
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
