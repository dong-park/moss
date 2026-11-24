"use client";

import { useState } from "react";
import { useT } from "@/i18n/Provider";
import { bootWorkspace } from "@/components/notifications/StorageBootstrap";

/**
 * first-wall n5 — 이 브라우저의 저장소를 열 수 없을 때 빈 흰 화면 대신 뜨는 안내.
 * 한 줄과 [다시 시도] 버튼이 전부다. 버튼은 부팅(저장소 초기화 + 불러오기)을 다시 부른다.
 * 성공하면 `bootstrapFailed`가 내려가 셸이 첫 벽을 연다. 계속 실패하면 이 안내가 남는다.
 */
export function StorageFailureNotice() {
  const t = useT();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await bootWorkspace();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed inset-0 z-[var(--z-modal)] flex flex-col items-center justify-center gap-4"
    >
      <p className="text-[15px] text-[#1d1d1f]">{t("storageFailure.message")}</p>
      <button
        type="button"
        onClick={() => void retry()}
        disabled={retrying}
        className="rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
      >
        {t("storageFailure.retry")}
      </button>
    </div>
  );
}
