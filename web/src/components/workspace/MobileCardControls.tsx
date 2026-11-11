"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import { layout } from "@/design/tokens";
import { linkUrl, reconcileMobileOperation, useMobileCanvas } from "./mobileCanvas";
import { useCompactControls } from "./useCompactControls";
import { useVisualViewport } from "./useVisualViewport";
import { MobileLinkEditor } from "./MobileLinkEditor";
import { MobileResizeControls } from "./MobileResizeControls";
import { resizeCardDimensions } from "./cardSizing";
import { isConnectableCard } from "./connectors/geometry";
import styles from "./mobileCanvas.module.css";
import { mobileHistoryKey, useMobileHistory } from "./useMobileHistory";

export function MobileCardControls() {
  const t = useT();
  const compact = useCompactControls();
  const viewport = useVisualViewport();
  const keyboardInset = viewport ? Math.max(0, window.innerHeight - viewport.top - viewport.height) : 0;
  const card = useWorkspace((s) => s.selectedIds.length === 1 ? s.cards.find((c) => c.id === s.selectedIds[0]) : undefined);
  const operation = useMobileCanvas((s) => s.operation);
  const close = useMobileCanvas((s) => s.close);
  useMobileHistory(operation.kind === "connect" || operation.kind === "resize" ? mobileHistoryKey(operation) : null);
  useEffect(() => {
    if (operation.kind !== "connect" && operation.kind !== "resize") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [operation.kind, close]);
  useEffect(() => {
    reconcileMobileOperation();
    return useWorkspace.subscribe(reconcileMobileOperation);
  }, []);
  if (!card) return null;
  const url = linkUrl(card);
  return <>
    <div className={styles.actions} data-mobile-card-controls data-canvas-control="dock" role="toolbar" aria-label={t("workspace.mobile.actions")}
      style={{ bottom: `calc(${layout.dock.bottomMargin + keyboardInset}px + env(safe-area-inset-bottom, 0px))` }}>
      {operation.kind === "connect" ? <>
        <p role="status" className={styles.hint}>{t("workspace.mobile.connectHint")}</p>
        <button type="button" onClick={close}>{t("workspace.mobile.cancel")}</button>
      </> : operation.kind === "resize" ? <>
        <MobileResizeControls card={card} apply={next => resizeCardDimensions(card.id, next)} close={close} />
      </> : <>
        {url !== null ? <>
          {url && <a href={url} target="_blank" rel="noopener noreferrer">{t("workspace.mobile.open")}</a>}
          <button type="button" onClick={() => useMobileCanvas.getState().editLink(card.id)}>{t("workspace.mobile.editLink")}</button>
        </> : card.kind === "photo" || (card.kind === "text" && !compact) ? <button type="button" onClick={() => useWorkspace.getState().setExpandedCard(card.id, "edit")}>{t("workspace.mobile.edit")}</button> : null}
        {isConnectableCard(card) && <button type="button" onClick={() => useMobileCanvas.getState().connect(card.id)}>{t("workspace.mobile.connect")}</button>}
        <button type="button" onClick={() => useMobileCanvas.getState().resize(card.id)}>{t("workspace.mobile.resize")}</button>
        <button type="button" onClick={() => { close(); useWorkspace.getState().clearSelection(); }}>{t("workspace.mobile.clear")}</button>
      </>}
    </div>
    {operation.kind === "link" && <MobileLinkEditor key={operation.token} operation={operation} />}
  </>;
}
