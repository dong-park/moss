"use client";
import { useEffect } from "react";
import { useMobileCanvas, type MobileOperation } from "./mobileCanvas";

export function mobileHistoryKey(operation: MobileOperation): string | null {
  if (operation.kind === "idle") return null;
  return operation.kind === "link" ? `link:${operation.token}` : `${operation.kind}:${operation.boardId}:${operation.cardId}`;
}
/** Same-URL history entry lets Back exit an operation before leaving the board. */
export function useMobileHistory(key: string | null) {
  useEffect(() => {
    if (!key) return;
    const url = window.location.href;
    if (window.history.state?.mossCanvasOperation !== key) {
      const next = { ...window.history.state, mossCanvasOperation: key };
      // A mode switch replaces the operation entry rather than stacking another Back stop.
      if (window.history.state?.mossCanvasOperation) window.history.replaceState(next, "", url);
      else window.history.pushState(next, "", url);
    }
    const back = () => {
      if (window.history.state?.mossCanvasOperation !== key) useMobileCanvas.getState().close();
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      queueMicrotask(() => {
        // Do not pop during Strict Mode's setup/cleanup probe or a new operation.
        if (mobileHistoryKey(useMobileCanvas.getState().operation) === null && window.history.state?.mossCanvasOperation === key && window.location.href === url) window.history.back();
      });
    };
  }, [key]);
}
