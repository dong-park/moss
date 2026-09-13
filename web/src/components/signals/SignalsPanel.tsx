"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/Provider";
import { useSignals } from "@/state/signals/useSignals";
import { KeywordsSection } from "./KeywordsSection";
import { RhythmSection } from "./RhythmSection";

/** 2단계 리뷰 P2: Dock.tsx가 이 값을 import해 SIGNALS_PANEL_WIDTH 중복 정의를 없앤다. */
export const PANEL_WIDTH = 420;

export function SignalsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const state = useSignals(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // FEAT-subcanvas: 패널이 열려 있으면 Esc를 독점한다. capture 단계에서
        // stopImmediatePropagation으로 Canvas의 Esc→goToParent(상위 캔버스 이동)가
        // 같은 키에 동시 발동하는 것을 막는다.
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 transition-opacity duration-200"
        style={{
          backgroundColor: "rgba(42, 39, 34, 0.06)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          zIndex: 40,
        }}
      />
      <aside
        role="complementary"
        aria-label={t("signals.title")}
        aria-hidden={!open}
        className="fixed top-0 right-0 h-screen bg-panel shadow-modal flex flex-col"
        style={{
          width: PANEL_WIDTH,
          transform: open ? "translateX(0)" : `translateX(${PANEL_WIDTH}px)`,
          transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
          zIndex: 41,
          borderLeft: "1px solid var(--color-border)",
        }}
      >
        <header className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-semibold text-text">
            {t("signals.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("signals.close")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text transition-colors"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {state.status === "opt-out" && (
            <section className="px-5 py-6">
              <h3 className="mb-1 text-[14px] font-medium text-text">
                {t("signals.optout.title")}
              </h3>
              <p className="text-[13px] text-text-soft leading-relaxed">
                {t("signals.optout.body")}
              </p>
            </section>
          )}

          {state.status === "empty" && (
            <section className="px-5 py-8">
              <h3 className="mb-1.5 text-[14px] font-medium text-text">
                {t("signals.empty.title")}
              </h3>
              <p className="text-[13px] text-text-soft leading-relaxed">
                {t("signals.empty.body")}
              </p>
            </section>
          )}

          {state.status === "ready" && (
            <>
              <KeywordsSection items={state.keywords} />
              <div className="mx-5 h-px bg-border/60" />
              <RhythmSection rhythm={state.rhythm} />
              <div className="mx-5 h-px bg-border/60" />
              <p className="px-5 py-4 text-[11px] text-text-soft italic">
                {t("signals.upcoming.label")}
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
