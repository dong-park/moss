"use client";
import { useSyncExternalStore } from "react";
import { useMobileCanvas } from "./mobileCanvas";
import { useCompactControls } from "./useCompactControls";
let lastTouch = false;
const subscribe = (listener: () => void) => {
  const query = window.matchMedia?.("(pointer: coarse)");
  const pointer = (event: PointerEvent) => {
    if (event.pointerType === "touch") lastTouch = true;
    else if (event.pointerType === "mouse" && useMobileCanvas.getState().operation.kind === "idle" && !(event.target as Element)?.closest?.("[data-mobile-card-controls], [data-mobile-link-editor], [data-resize-handle]")) lastTouch = false;
    listener();
  };
  query?.addEventListener("change", listener);
  window.addEventListener("pointerdown", pointer, true);
  return () => { query?.removeEventListener("change", listener); window.removeEventListener("pointerdown", pointer, true); };
};
const snapshot = () => lastTouch || (window.matchMedia?.("(pointer: coarse)").matches ?? false);
export function useTouchControls() {
  const compact = useCompactControls();
  const touch = useSyncExternalStore(subscribe, snapshot, () => false);
  return compact || touch;
}
