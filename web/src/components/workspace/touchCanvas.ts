import { useEffect, type RefObject } from "react";
import { MIN_SCALE, MAX_SCALE, useWorkspace } from "@/state/workspace";

import { activeResizePointerId, cancelActiveResize } from "./resizeSession";
import { finishMobileConnection, useMobileCanvas } from "./mobileCanvas";

type Point = { clientX: number; clientY: number };
export type TouchDrag = { move: (point: Point) => void; end: () => void; cancel: () => void };
// DOM registration keeps touch on the same drag/drop implementation as mouse input.
export const touchCardDrags = new WeakMap<HTMLElement, (point: Point) => TouchDrag | undefined>();
const INTERACTIVE = "input, textarea, button, a, select, [contenteditable='true'], [data-textbox-toolbar], [data-canvas-control]";

export function useTouchCanvas(ref: RefObject<HTMLDivElement | null>, boardId: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const points = new Map<number, Point>();
    // A second finger cancels resize; consume that entire gesture until all fingers lift.
    const resizeBlocked = new Set<number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let drag: TouchDrag | undefined;
    let card: HTMLElement | null = null;
    let origin: Point | undefined;
    let pending = false;
    let suppressUntil = 0;
    let connectionClickUntil = 0;
    let pinchMin = MIN_SCALE;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const cancelDrag = () => { clearTimer(); drag?.cancel(); drag = undefined; pending = false; card = null; };
    const geometry = () => {
      const [a, b] = [...points.values()];
      return { x: b ? (a.clientX + b.clientX) / 2 : a.clientX, y: b ? (a.clientY + b.clientY) / 2 : a.clientY, distance: b ? Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) : 0 };
    };
    const down = (e: PointerEvent) => {
      const connecting = useMobileCanvas.getState().operation.kind === "connect";
      if (e.pointerType !== "touch" && !connecting) return;
      if (!connecting) connectionClickUntil = 0;
      const resizePointer = activeResizePointerId();
      const target = e.target as HTMLElement;
      const resizeHandle = target.closest("[data-resize-handle]");
      if (resizeBlocked.size || (resizePointer !== null && resizePointer !== e.pointerId) || (points.size > 0 && resizeHandle)) {
        if (resizePointer !== null) resizeBlocked.add(resizePointer);
        resizeBlocked.add(e.pointerId);
        for (const id of points.keys()) resizeBlocked.add(id);
        cancelDrag();
        points.clear();
        cancelActiveResize();
        suppressUntil = Date.now() + 800;
        e.preventDefault();
        e.stopPropagation();
        root.setPointerCapture?.(e.pointerId);
        return;
      }
      if (useWorkspace.getState().penMode) return;
      // Let the handle receive its native pointerdown. Never start pan/hold or capture it here.
      if (resizeHandle) {
        suppressUntil = Date.now() + 800;
        return;
      }
      const blankLink = target.closest('[data-memo-face="linkEmpty"]');
      if (!connecting && !blankLink && target.closest(INTERACTIVE)) return;
      const host = target.closest<HTMLElement>("[data-card-id]");
      if (!host && target !== root && !points.size) return;
      points.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      suppressUntil = Date.now() + 800;
      e.preventDefault();
      e.stopPropagation();
      root.setPointerCapture?.(e.pointerId);
      if (points.size > 1) { cancelDrag(); return; }
      pinchMin = Math.min(useWorkspace.getState().viewport.scale, MIN_SCALE);
      card = host;
      origin = { clientX: e.clientX, clientY: e.clientY };
      pending = !!card;
      if (card && !connecting) {
        const pressedCard = card;
        const start = origin;
        timer = setTimeout(() => {
          pending = false;
          drag = touchCardDrags.get(pressedCard)?.(start);
        }, 400);
      }
    };
    const move = (e: PointerEvent) => {
      if (resizeBlocked.has(e.pointerId)) { e.preventDefault(); e.stopPropagation(); return; }
      if (!points.has(e.pointerId)) return;
      e.preventDefault();
      e.stopPropagation();
      const before = geometry();
      points.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      if (points.size === 1 && card) {
        if (pending && origin && Math.hypot(e.clientX - origin.clientX, e.clientY - origin.clientY) > 8) {
          // Scrolling before the hold deadline pans; it never moves a card.
          cancelDrag();
        } else { drag?.move(e); return; }
      }
      const after = geometry();
      const rect = root.getBoundingClientRect();
      const v = useWorkspace.getState().viewport;
      const scale = before.distance > 0 && after.distance > 0
        ? Math.max(pinchMin, Math.min(MAX_SCALE, v.scale * after.distance / before.distance)) : v.scale;
      useWorkspace.setState({ viewport: {
        scale,
        x: after.x - rect.left - (before.x - rect.left - v.x) * scale / v.scale,
        y: after.y - rect.top - (before.y - rect.top - v.y) * scale / v.scale,
      } });
    };
    const finish = (e: PointerEvent) => {
      if (resizeBlocked.has(e.pointerId)) {
        e.preventDefault();
        e.stopPropagation();
        // Releasing resize capture on cancellation is not a physical finger lift.
        if (e.type !== "lostpointercapture") {
          resizeBlocked.delete(e.pointerId);
          if (root.hasPointerCapture?.(e.pointerId)) root.releasePointerCapture(e.pointerId);
        }
        suppressUntil = Date.now() + 800;
        return;
      }
      if (e.pointerId === activeResizePointerId()) {
        suppressUntil = Date.now() + 800;
        return; // ResizeHandles must receive the terminal event and close its group.
      }
      if (!points.has(e.pointerId)) return;
      e.preventDefault();
      e.stopPropagation();
      suppressUntil = Date.now() + 800;
      if (e.type === "pointerup") {
        if (pending && card?.dataset.cardId) {
          if (useMobileCanvas.getState().operation.kind === "connect") {
            connectionClickUntil = Date.now() + 800;
            finishMobileConnection(card.dataset.cardId);
          } else useWorkspace.getState().selectOne(card.dataset.cardId);
        }
        drag?.end();
        drag = undefined;
      }
      cancelDrag();
      points.delete(e.pointerId);
      if (root.hasPointerCapture?.(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };
    const suppressMouse = (e: Event) => {
      if (Date.now() < connectionClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      if (points.size || resizeBlocked.size || Date.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); }
    };
    root.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) window.addEventListener(type, finish as EventListener, true);
    for (const type of ["mousedown", "click", "dblclick", "contextmenu"]) root.addEventListener(type, suppressMouse, true);
    return () => {
      cancelActiveResize(root);
      cancelDrag();
      for (const id of resizeBlocked) if (root.hasPointerCapture?.(id)) root.releasePointerCapture(id);
      resizeBlocked.clear();
      for (const id of points.keys()) if (root.hasPointerCapture?.(id)) root.releasePointerCapture(id);
      points.clear();
      root.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) window.removeEventListener(type, finish as EventListener, true);
      for (const type of ["mousedown", "click", "dblclick", "contextmenu"]) root.removeEventListener(type, suppressMouse, true);
    };
  }, [ref, boardId]);
}
