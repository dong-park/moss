"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";

/**
 * FEAT-onboarding-routes n4 — 로그인했는데 사용자 보드가 없을 때 첫 보드를 고른다 (D5-1, AC-5).
 *
 * - "예제로 시작": 예제 메모 3장이 든 새 보드 → `/b/<uuid>`
 * - "빈 보드로 시작": 빈 새 보드 → `/b/<uuid>`
 *
 * 보드 생성·이동은 스토어가 한다(createExampleBoard·createBoard → navigateToBoard).
 * 이 컴포넌트는 선택 UI만 제공한다. 시스템 보드에 사용자가 만든 메모가 있으면
 * 아예 렌더되지 않는다([[needsFirstBoard]] — AC-7).
 */
export function FirstBoardChooser() {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const start = async (create: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    try {
      await create();
    } catch {
      // 보드 생성 실패 시 선택 화면을 남긴다.
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-panel)] flex items-center justify-center bg-[var(--color-bg)]">
      <div
        role="dialog"
        aria-label={t("onboarding.firstBoard.title")}
        className="w-[320px] rounded-[18px] bg-white/85 p-[26px_24px_20px] text-center shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h1 className="mb-1 text-[18px] font-semibold">
          {t("onboarding.firstBoard.title")}
        </h1>
        <p className="text-[12px] text-[#8e8e93]">
          {t("onboarding.firstBoard.intro")}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(() => useWorkspace.getState().createExampleBoard())}
            className="w-full cursor-pointer rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
          >
            {t("onboarding.firstBoard.example")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(() => useWorkspace.getState().createBoard())}
            className="w-full cursor-pointer rounded-[10px] border border-[#d5d5d8] bg-white px-4 py-2.5 text-[13px] font-medium text-[#1d1d1f] disabled:opacity-60"
          >
            {t("onboarding.firstBoard.empty")}
          </button>
        </div>
      </div>
    </div>
  );
}
