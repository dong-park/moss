"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/i18n/Provider";
import type { BoardAccess } from "@/state/boardAccess";

/** 카드로 안내하는 판정만 받는다 — open·shared는 렌더 대상이 아니다. */
export type BlockedBoardAccess = Extract<
  BoardAccess,
  { kind: "not-found" | "no-access" | "offline" }
>;

/**
 * FEAT-onboarding-routes n5 — 로컬에 없는 보드 주소를 열었을 때 뜨는 카드.
 * `SessionExpiredCard`와 같은 틀(캔버스 배경 위 가운데 카드)을 쓴다 (spec §7).
 *
 * - not-found: "찾을 수 없는 보드예요" + "마지막 보드로" (AC-8)
 * - no-access: "이 보드를 볼 수 없어요" — 존재 여부를 드러내지 않는다 (AC-10)
 * - offline: "연결되면 다시 시도할게요" + "다시 시도" (AC-13)
 */
export function BoardAccessCard({
  access,
  onRetry,
}: {
  access: BlockedBoardAccess;
  onRetry?: () => void;
}) {
  const t = useT();
  const router = useRouter();

  const title =
    access.kind === "not-found"
      ? t("boardAccess.notFound.title")
      : access.kind === "offline"
        ? t("boardAccess.offline.title")
        : t("boardAccess.noAccess.title");
  const body =
    access.kind === "not-found"
      ? t("boardAccess.notFound.body")
      : access.kind === "offline"
        ? t("boardAccess.offline.body")
        : t("boardAccess.noAccess.body");

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: "rgba(236,237,239,.35)" }}
      />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-[300px] rounded-[18px] bg-white/85 p-[26px_24px_20px] text-center shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h3 className="mb-1 text-[17px] font-semibold">{title}</h3>
        <p className="text-[12px] text-[#8e8e93]">{body}</p>
        {access.kind === "not-found" ? (
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mx-auto mt-4 flex w-full items-center justify-center rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white"
          >
            {t("boardAccess.notFound.goLast")}
          </button>
        ) : null}
        {access.kind === "offline" ? (
          <button
            type="button"
            onClick={onRetry}
            className="mx-auto mt-4 flex w-full items-center justify-center rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white"
          >
            {t("boardAccess.offline.retry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
