"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { commitMobileLink, useMobileCanvas, type MobileOperation } from "./mobileCanvas";
import { useVisualViewport } from "./useVisualViewport";
import styles from "./mobileCanvas.module.css";
import { mobileHistoryKey, useMobileHistory } from "./useMobileHistory";

export function MobileLinkEditor({ operation }: { operation: Extract<MobileOperation, { kind: "link" }> }) {
  const t = useT();
  const viewport = useVisualViewport();
  const [draft, setDraft] = useState(operation.originalUrl);
  const [error, setError] = useState<"invalid" | "conflict" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useMobileCanvas((s) => s.close);
  useMobileHistory(mobileHistoryKey(operation));
  const commit = () => {
    const result = commitMobileLink(operation, draft);
    if (result === "saved" || result === "missing") close();
    else setError(result);
  };
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content data-mobile-link-editor className={styles.sheet} aria-describedby={undefined}
          style={{ top: (viewport?.top ?? 0) + 64, maxHeight: viewport ? Math.max(0, viewport.height - 72) : "calc(100dvh - 72px)" }}
          onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}
          onCloseAutoFocus={(e) => e.preventDefault()}>
          <Dialog.Title className={styles.title}>{t("workspace.mobile.linkDialog")}</Dialog.Title>
          <p className="text-xs text-text-soft">{t("reviewGuidance.link.draft")}</p>
          <form noValidate onSubmit={(e) => { e.preventDefault(); commit(); }}>
            <label className={styles.field}>
              {t("workspace.mobile.url")}
              <input ref={input} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" autoComplete="url"
                value={draft} onChange={(e) => { setDraft(e.target.value); setError(null); }}
                aria-invalid={!!error} aria-describedby={error ? `link-error-${operation.token}` : undefined}
                onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }} />
            </label>
            {error && <p role="alert" id={`link-error-${operation.token}`}>{t(`workspace.mobile.${error}`)}</p>}
            <div className={styles.buttons}>
              <button type="button" onClick={close}>{t("workspace.mobile.cancel")}</button>
              <button type="submit">{t("workspace.mobile.done")}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
