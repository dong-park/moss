"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import { FRAME_DEFAULT_HEIGHT, type Card } from "@/state/workspace";
import styles from "./mobileCanvas.module.css";

type Dimensions = { width: number; height?: number };
export function MobileResizeControls({ card, apply, close }: { card: Card; apply: (next: Dimensions) => Dimensions | undefined; close: () => void }) {
  return <>
    <div className={styles.dimensions}>
      <Dimension key={`${card.id}:w`} axis="width" value={card.width} commit={width => apply({ width })?.width} />
      {card.kind === "frame" && <Dimension key={`${card.id}:h`} axis="height" value={card.height ?? FRAME_DEFAULT_HEIGHT} commit={height => apply({ width: card.width, height })?.height} />}
    </div>
    <Stop close={close} />
  </>;
}
function Stop({close}:{close:()=>void}) { const t=useT(); return <button type="button" onClick={close}>{t("workspace.mobile.stopResize")}</button>; }
function Dimension({ axis, value, commit }: { axis: "width" | "height"; value: number; commit: (value: number) => number | undefined }) {
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
    <input ref={inputRef} aria-label={label} type="number" inputMode="decimal" min="1" step="any" defaultValue={Math.round(value * 100) / 100}
      aria-invalid={invalid} onChange={() => setInvalid(false)} onBlur={e => submit(e.currentTarget)}
      onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); } }} />
    <button type="button" aria-label={`${label} ${t("workspace.mobile.larger")}`} onClick={() => commit(value + 16)}>+</button>
    {invalid && <span role="alert">{t("workspace.mobile.invalidSize")}</span>}
  </div>;
}
