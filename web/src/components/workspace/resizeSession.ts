/** Resize ownership is separate from canvas pan/drag ownership. */
let active: { pointerId: number; cancel: () => void; owner: HTMLElement } | undefined;

export function activeResizePointerId(): number | null {
  return active?.pointerId ?? null;
}

export function cancelActiveResize(within?: HTMLElement): void {
  if (!active || (within && !within.contains(active.owner))) return;
  active.cancel();
}

export function ownResizePointer(pointerId: number, owner: HTMLElement, cancel: () => void): () => void {
  cancelActiveResize();
  const session = { pointerId, owner, cancel };
  active = session;
  return () => { if (active === session) active = undefined; };
}
