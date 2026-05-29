"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/Provider";
import { BOARD_UNDO_MS, useWorkspace } from "@/state/workspace";

/**
 * FEAT-subcanvas: 함(서브 보드 트리) 삭제 후 5초 동안 노출되는 undo toast.
 * pendingSubcanvasUndo가 set되어 있을 때만 렌더되고, 만료 시 store가 자동으로
 * blob까지 정리하며 null로 비운다. BoardUndoToast와 동일 패턴.
 */
export function SubcanvasUndoToast() {
  const t = useT();
  const pending = useWorkspace((s) => s.pendingSubcanvasUndo);
  const undo = useWorkspace((s) => s.undoSubcanvasRemove);
  const clear = useWorkspace((s) => s.clearSubcanvasUndo);
  const [remaining, setRemaining] = useState(BOARD_UNDO_MS);

  useEffect(() => {
    if (!pending) return;
    const tick = () => setRemaining(Math.max(0, pending.expiresAt - Date.now()));
    tick();
    const handle = setInterval(tick, 100);
    return () => clearInterval(handle);
  }, [pending]);

  if (!pending) return null;

  const secondsLeft = Math.ceil(remaining / 1000);

  return (
    <div
      role="status"
      data-subcanvas-undo-toast
      className="fixed bottom-6 left-1/2 z-[var(--z-toast)] -translate-x-1/2 flex items-center gap-3 rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text shadow-card-lift"
    >
      <span className="text-text-muted">
        {t("workspace.subcanvas.deletedToast")} · {secondsLeft}s
      </span>
      <button
        type="button"
        onClick={() => void undo()}
        className="cursor-pointer rounded-md px-2 py-1 text-sm font-medium text-accent-lime transition-colors hover:bg-panel"
        data-subcanvas-undo-button
      >
        {t("workspace.boardPicker.undo")}
      </button>
      <button
        type="button"
        onClick={clear}
        aria-label="dismiss"
        className="cursor-pointer rounded-md px-2 py-1 text-xs text-text-soft transition-colors hover:bg-panel"
      >
        ×
      </button>
    </div>
  );
}
