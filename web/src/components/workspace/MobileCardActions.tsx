"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import { linkUrl, useMobileCanvas } from "./mobileCanvas";
import { useCompactControls } from "./useCompactControls";
import { touchCardDrags, type TouchDrag } from "./touchCanvas";
import styles from "./canvasControls.module.css";

/** Screen-space controls remain finger-sized when the board is zoomed out. */
export function MobileCardActions({ canvasRef }: { canvasRef: RefObject<HTMLDivElement | null> }) {
  const compact = useCompactControls();
  const t = useT();
  const card = useWorkspace((s) => s.selectedIds.length === 1 ? s.cards.find((c) => c.id === s.selectedIds[0]) : undefined);
  const viewport = useWorkspace((s) => s.viewport);
  const busy = useMobileCanvas((s) => s.operation.kind !== "idle");
  const hidden = useWorkspace((s) => !!s.expandedCardId || !!s.editingId || s.penMode) || busy;
  const drag = useRef<TouchDrag | undefined>(undefined);
  const pointerId = useRef<number | null>(null);
  useEffect(() => () => { drag.current?.cancel(); drag.current = undefined; pointerId.current = null; }, [card?.id, hidden, compact]);
  if (!compact || !card || hidden) return null;

  const left = Math.max(8, Math.min(window.innerWidth - 208, card.x * viewport.scale + viewport.x));
  const top = Math.max(8, Math.min(window.innerHeight - 240, (card.y + (card.height ?? card.width)) * viewport.scale + viewport.y + 12));
  const edit = () => {
    if (card.kind === "text") useWorkspace.getState().setExpandedCard(card.id, "edit");
    else useWorkspace.getState().setEditing(card.id);
  };
  return (
    <div role="toolbar" aria-label={t("workspace.memoEditor.cardActions")} className={styles.cardActions}
      style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
      {((card.kind === "text" && linkUrl(card) === null) || card.kind === "textbox") && (
        <button type="button" onClick={edit}>{t("workspace.memoEditor.edit")}</button>
      )}
      <button type="button" aria-label={t("workspace.memoEditor.moveHint")} style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointerId.current !== null) return;
          const element = Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? []).find((el) => el.dataset.cardId === card.id);
          if (!element) return;
          event.preventDefault();
          event.stopPropagation();
          drag.current = touchCardDrags.get(element)?.(event);
          if (!drag.current) return;
          pointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => { if (pointerId.current === event.pointerId) drag.current?.move(event); }}
        onPointerUp={(event) => {
          if (pointerId.current !== event.pointerId) return;
          const active = drag.current;
          drag.current = undefined;
          pointerId.current = null;
          active?.end();
        }}
        onLostPointerCapture={() => { drag.current?.cancel(); drag.current = undefined; pointerId.current = null; }}
        onPointerCancel={() => { drag.current?.cancel(); drag.current = undefined; pointerId.current = null; }}>
        ↔ {t("workspace.memoEditor.move")}
      </button>
    </div>
  );
}
