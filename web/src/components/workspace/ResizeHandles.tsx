"use client";

import { useEffect, useRef } from "react";
import { useWorkspace, type Card } from "@/state/workspace";
import { beginUndoGroup, endUndoGroup } from "@/state/ydoc/undo";
import { applyCardResize, finishCardResize, isAutoHeightCard, resizeFromHandle, type ResizeDirection } from "./cardSizing";
import { ownResizePointer } from "./resizeSession";

type HandleDir = ResizeDirection;

// 보이는 점(dot)은 그대로 8×8 유지, 잡히는 hit zone만 키운다.
// 코너는 20×20 사각형, 사이드는 edge 전체 길이 × 16px 두께.
const CORNER_HIT = 20;
const EDGE_HIT_THICKNESS = 16;
const CORNER_OFFSET = CORNER_HIT / 2;
const EDGE_OFFSET = EDGE_HIT_THICKNESS / 2;

const HANDLES: {
  dir: HandleDir;
  cursor: string;
  hitStyle: React.CSSProperties;
}[] = [
  { dir: "nw", cursor: "nwse-resize",
    hitStyle: { left: -CORNER_OFFSET, top: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "ne", cursor: "nesw-resize",
    hitStyle: { right: -CORNER_OFFSET, top: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "se", cursor: "nwse-resize",
    hitStyle: { right: -CORNER_OFFSET, bottom: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "sw", cursor: "nesw-resize",
    hitStyle: { left: -CORNER_OFFSET, bottom: -CORNER_OFFSET, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 } },
  { dir: "n", cursor: "ns-resize",
    hitStyle: { left: 0, right: 0, top: -EDGE_OFFSET, height: EDGE_HIT_THICKNESS, zIndex: 30 } },
  { dir: "s", cursor: "ns-resize",
    hitStyle: { left: 0, right: 0, bottom: -EDGE_OFFSET, height: EDGE_HIT_THICKNESS, zIndex: 30 } },
  { dir: "e", cursor: "ew-resize",
    hitStyle: { top: 0, bottom: 0, right: -EDGE_OFFSET, width: EDGE_HIT_THICKNESS, zIndex: 30 } },
  { dir: "w", cursor: "ew-resize",
    hitStyle: { top: 0, bottom: 0, left: -EDGE_OFFSET, width: EDGE_HIT_THICKNESS, zIndex: 30 } },
];

export function ResizeHandles({ card, measuredHeight, mobile = false }: {
  card: Card;
  /** Fallback when no stored height is available. */
  measuredHeight: number;
  /** Parent opts in only while mobile resize mode is active. */
  mobile?: boolean;
}) {
  const scale = useWorkspace((s) => s.viewport.scale);
  const autoHeight = isAutoHeightCard(card);
  const visibleHandles = mobile
    ? HANDLES.filter((h) => h.dir === (autoHeight ? "e" : "se"))
    : autoHeight ? HANDLES.filter((h) => h.dir === "e" || h.dir === "w") : HANDLES;
  const finishRef = useRef<(() => void) | null>(null);
  const suppressMouseUntil = useRef(0);
  useEffect(() => () => { finishRef.current?.(); }, []);

  const start = (dir: HandleDir, clientX: number, clientY: number, pointer?: { id: number; owner: HTMLElement }) => {
    finishRef.current?.();
    const origin = useWorkspace.getState().cards.find((c) => c.id === card.id) ?? card;
    const token = beginUndoGroup();
    let changed = false;
    let finished = false;
    let releaseOwnership: (() => void) | undefined;
    const move = (e: MouseEvent | PointerEvent) => {
      if (pointer && (e as PointerEvent).pointerId !== pointer.id) return;
      e.preventDefault();
      e.stopPropagation();
      const zoom = useWorkspace.getState().viewport.scale;
      if (!Number.isFinite(zoom) || zoom <= 0) return;
      changed = applyCardResize(card.id, resizeFromHandle(origin, measuredHeight, dir, (e.clientX - clientX) / zoom, (e.clientY - clientY) / zoom)) || changed;
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      finishRef.current = null;
      window.removeEventListener(pointer ? "pointermove" : "mousemove", move);
      window.removeEventListener(pointer ? "pointerup" : "mouseup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("lostpointercapture", up);
      window.removeEventListener("pointerdown", secondPointer);
      releaseOwnership?.();
      if (pointer) {
        suppressMouseUntil.current = Date.now() + 800;
        if (pointer.owner.hasPointerCapture?.(pointer.id)) pointer.owner.releasePointerCapture(pointer.id);
      }
      try { if (changed) finishCardResize(card.id); }
      finally { endUndoGroup(token); }
    };
    const up = (e: MouseEvent | PointerEvent) => {
      if (pointer && (e as PointerEvent).pointerId !== pointer.id) return;
      e.stopPropagation();
      finish();
    };
    // Canvas capture arbitration handles a second finger first. Standalone handles also clean up.
    const secondPointer = (e: PointerEvent) => {
      if (pointer && e.pointerType === "touch" && e.pointerId !== pointer.id) finish();
    };
    finishRef.current = finish;
    window.addEventListener(pointer ? "pointermove" : "mousemove", move, { passive: false });
    window.addEventListener(pointer ? "pointerup" : "mouseup", up);
    if (pointer) {
      releaseOwnership = ownResizePointer(pointer.id, pointer.owner, finish);
      window.addEventListener("pointercancel", up);
      window.addEventListener("lostpointercapture", up);
      window.addEventListener("pointerdown", secondPointer);
      pointer.owner.setPointerCapture?.(pointer.id);
    }
  };

  return <>{visibleHandles.map(({ dir, cursor, hitStyle }) => {
    const hit = 48 / (Number.isFinite(scale) && scale > 0 ? scale : 1);
    // Width-only grips sit below short cards, clear of center connection ports.
    const desktopStyle: React.CSSProperties = autoHeight
      ? { ...(dir === "e" ? { right: -CORNER_OFFSET } : { left: -CORNER_OFFSET }), bottom: -24, width: CORNER_HIT, height: CORNER_HIT, zIndex: 31 }
      : hitStyle;
    const mobileStyle: React.CSSProperties = {
      right: -hit / 2, width: hit, height: hit, zIndex: 31,
      ...(dir === "e" ? { top: "50%", marginTop: -hit / 2 } : { bottom: -hit / 2 }),
    };
    return <span
      key={dir}
      data-resize-handle={dir}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        suppressMouseUntil.current = Date.now() + 800;
        start(dir, e.clientX, e.clientY, { id: e.pointerId, owner: e.currentTarget });
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (finishRef.current || Date.now() < suppressMouseUntil.current) return;
        start(dir, e.clientX, e.clientY);
      }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="absolute"
      style={{ ...(mobile ? mobileStyle : desktopStyle), cursor, touchAction: "none" }}
    >
      <span aria-hidden className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-bg shadow-card" />
    </span>;
  })}</>;
}
