"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/Provider";
import { useStorage } from "@/state/storage";
import { useWorkspace, type Card } from "@/state/workspace";
import { useCompactControls } from "./useCompactControls";
import { useMobileCanvas } from "./mobileCanvas";

/** Screen-space settings are separate from the card's editing and connection handles. */
export function CardPrivacyControl({ placement = "canvas" }: { placement?: "canvas" | "toolbar" }) {
  const compact = useCompactControls();
  const card = useWorkspace(s => s.selectedIds.length === 1 ? s.cards.find(c => c.id === s.selectedIds[0]) : undefined);
  const hidden = useWorkspace(s => !!s.editingId || !!s.expandedCardId || s.penMode);
  const operating = useMobileCanvas(s => s.operation.kind !== "idle");
  if ((placement === "canvas" && compact) || !card || hidden || operating) return null;
  return <Settings key={card.id} card={card} inline={placement === "toolbar"} />;
}

function Settings({ card, inline }: { card: Card; inline: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    if (!open || !inline) return;
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const bounds = panel.current?.getBoundingClientRect();
      if (!anchor || !bounds) return;
      setPosition({ left: Math.max(12, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12)), top: Math.max(12, anchor.top - bounds.height - 8) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, inline]);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const globalExcluded = useStorage(s => s.settings?.aiOptOutGlobal ?? false);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus();
    };
    window.addEventListener("pointerdown", outside);
    root.current?.addEventListener("keydown", escape);
    panel.current?.addEventListener("keydown", escape);
    const currentPanel = panel.current;
    const current = root.current;
    return () => { window.removeEventListener("pointerdown", outside); current?.removeEventListener("keydown", escape); currentPanel?.removeEventListener("keydown", escape); };
  }, [open]);
  const content = <div ref={panel} id={id} style={inline ? position : undefined}
    onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} className={`${inline ? "fixed z-[var(--z-panel)]" : "mt-2"} w-64 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-bg p-3 text-text shadow-card`}>
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={!!card.aiOptOut} onChange={() => useWorkspace.getState().toggleAIOptOut(card.id)} className="h-5 w-5" />
        {t("reviewCanvas.cardAIExclude")}
      </label>
      <p className="mt-1 leading-relaxed text-text-muted">{t("reviewCanvas.privacyScope")}</p>
      {globalExcluded && <p role="status" className="mt-2 leading-relaxed">{t("reviewCanvas.globalExcluded")}</p>}
    </div>;
  return <div ref={root} data-canvas-control="privacy" className={inline ? "relative text-xs" : "absolute left-3 top-16 z-[var(--z-panel)] max-w-[calc(100%-24px)] text-xs"}
    onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="min-h-11 rounded-xl border border-border bg-bg px-3 text-text shadow-card focus-visible:outline-2 focus-visible:outline-accent-blue">
      {t("reviewCanvas.privacy")} · {t(globalExcluded || card.aiOptOut ? "reviewCanvas.aiExcluded" : "reviewCanvas.aiAllowed")}
    </button>
    {open && (inline ? createPortal(content, document.body) : content)}
  </div>;
}
