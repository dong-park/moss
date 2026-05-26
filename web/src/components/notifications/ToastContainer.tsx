"use client";

import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";

export function ToastContainer() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const t = useT();

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="notifications"
      className="fixed bottom-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "warn" ? "alert" : "status"}
          className="pointer-events-auto max-w-sm rounded-lg border bg-[var(--color-panel)] px-4 py-3 text-sm shadow-[var(--shadow-card,0_1px_2px_rgba(0,0,0,0.05))]"
          style={{
            borderColor:
              toast.tone === "warn"
                ? "var(--color-accent-blue)"
                : "var(--color-border)",
            transition: `opacity var(--duration-slow) var(--easing-out)`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-[var(--color-text)]">
                {toast.title}
              </div>
              {toast.body && (
                <div className="mt-1 text-[var(--color-text-muted)]">
                  {toast.body}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {toast.action && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await toast.action!.onClick();
                    } finally {
                      dismiss(toast.id);
                    }
                  }}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-hover)]"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t("storage.toast.dismiss")}
                className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
