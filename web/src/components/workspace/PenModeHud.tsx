"use client";

import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";

/**
 * FEAT-pen-mode-ux B1 (AC-1): 펜 모드 상시 가시화 HUD.
 *
 * 펜 모드는 전역 모달 상태인데 그동안 신호가 사이드바 아이콘 active + 펜 커서뿐이라
 * "모드를 잊으면 멈춘 줄 안다"는 안티패턴이 있었다. 펜 모드 ON 동안 캔버스 상단에
 * 저채도 배너를 상시 띄워 "지금 펜 모드 · Esc로 해제"를 분명히 한다. OFF면 사라진다.
 *
 * penMode만 atomic 구독 — 다른 상태 변화에 리렌더되지 않는다(비기능 §8).
 * role="status"로 보조기술이 모드 전환을 읽을 수 있게 한다(§8 접근성).
 * 펜 상태 액션은 추가하지 않고 기존 전역 상태만 읽는다(범위 §2).
 */
export function PenModeHud() {
  const t = useT();
  const penMode = useWorkspace((s) => s.penMode);
  if (!penMode) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-4 z-[var(--z-panel)] -translate-x-1/2"
    >
      <div
        className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px]"
        style={{
          background: "var(--gradient-paper)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span aria-hidden="true">✏️</span>
        <span className="font-semibold text-text">{t("workspace.pen.hud.label")}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{t("workspace.pen.hud.hint")}</span>
      </div>
    </div>
  );
}
