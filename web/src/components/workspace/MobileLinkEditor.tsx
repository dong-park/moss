"use client";

import { useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { isImeEnter } from "./ime";
import { commitMobileLink, useMobileCanvas, type MobileOperation } from "./mobileCanvas";
import styles from "./mobileCanvas.module.css";
import { mobileHistoryKey, useMobileHistory } from "./useMobileHistory";

export function MobileLinkEditor({ operation }: { operation: Extract<MobileOperation, { kind: "link" }> }) {
  const t = useT();
  const [bounds, setBounds] = useState({ top: 64, height: 0 });
  useLayoutEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top, 0px)";
    document.body.appendChild(probe);
    const headers = Array.from(document.querySelectorAll("[data-workspace-editor-header]"));
    const update = () => {
      const visual = window.visualViewport;
      const offset = visual?.offsetTop ?? 0;
      const safe = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      const bottom = Math.max(0, ...headers.map((header) => header.getBoundingClientRect().bottom));
      const top = Math.max(offset + safe, bottom + 8);
      setBounds({ top, height: Math.max(0, offset + (visual?.height ?? window.innerHeight) - top - 8) });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    headers.forEach((header) => observer?.observe(header));
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    update();
    return () => {
      observer?.disconnect();
      probe.remove();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
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
          style={{ top: bounds.top, maxHeight: bounds.height }}
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
                onKeyDown={(e) => { if (isImeEnter(e)) e.preventDefault(); }} />
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
