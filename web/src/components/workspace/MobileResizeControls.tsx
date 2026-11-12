"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import { FRAME_DEFAULT_HEIGHT, type Card } from "@/state/workspace";
import { cardWidthLimits, frameHasAspect, isAutoHeightCard } from "./cardSizing";
import styles from "./mobileCanvas.module.css";

type Dimensions = { width: number; height?: number };
export function MobileResizeControls({ card, apply, close }: { card: Card; apply: (next: Dimensions) => Dimensions | undefined; close: () => void }) {
  const t = useT();
  const limits = cardWidthLimits(card);
  const aspect = frameHasAspect(card);
  const hint = card.kind === "frame" ? (aspect ? "frameAspect" : "frameSize")
    : isAutoHeightCard(card) ? "autoHeight" : card.kind === "text" ? "squareSize" : "aspectSize";
  return <>
    <div className={styles.resizePanel}>
      <p className={styles.resizeHint}>{t(`reviewCanvas.${hint}`)}{limits && <> · {t("reviewCanvas.widthLimits", limits)}</>}</p>
      <div className={styles.dimensions}>
        <Dimension key={`${card.id}:w`} axis="width" value={card.width} commit={width => apply({ width })?.width} min={limits?.min} max={limits?.max} />
        {card.kind === "frame" && (aspect ? <span className={styles.hint}>{t("workspace.mobile.height")} {Math.round(card.height ?? FRAME_DEFAULT_HEIGHT)}</span>
          : <Dimension key={`${card.id}:h`} axis="height" value={card.height ?? FRAME_DEFAULT_HEIGHT} commit={height => apply({ width: card.width, height })?.height} />)}
      </div>
    </div>
    <Stop close={close} />
  </>;
}
function Stop({close}:{close:()=>void}) { const t=useT(); return <button type="button" onClick={close}>{t("workspace.mobile.stopResize")}</button>; }
function Dimension({ axis, value, commit, min = 1, max }: { axis: "width" | "height"; value: number; commit: (value: number) => number | undefined; min?: number; max?: number }) {
  const t = useT();
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.value = String(Math.round(value * 100) / 100);
  }, [value]);
  const label = t(axis === "width" ? "workspace.mobile.width" : "workspace.mobile.height");
  const submit = (input: HTMLInputElement) => {
    const next = input.valueAsNumber;
    if (!Number.isFinite(next) || next <= 0) { setInvalid(true); return; }
    setInvalid(false);
    const actual = commit(next);
    if (actual !== undefined) input.value = String(Math.round(actual * 100) / 100);
  };
  return <div className={styles.dimension}>
    <button type="button" aria-label={`${label} ${t("workspace.mobile.smaller")}`} onClick={() => commit(value - 16)}>−</button>
    <input ref={inputRef} aria-label={label} type="number" inputMode="decimal" min={min} max={max} step="any" defaultValue={Math.round(value * 100) / 100}
      aria-invalid={invalid} onChange={() => setInvalid(false)} onBlur={e => submit(e.currentTarget)}
      onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); } }} />
    <button type="button" aria-label={`${label} ${t("workspace.mobile.larger")}`} onClick={() => commit(value + 16)}>+</button>
    {invalid && <span role="alert">{t("workspace.mobile.invalidSize")}</span>}
  </div>;
}
