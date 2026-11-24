import { layout } from "./tokens";

/** Two separate rows keep all controls reachable on phones, including landscape. */
export const canvasControls = { gap: 8, zoomHeight: 52, clearance: 12, touchTarget: 44 } as const;
export const compactControls = (width: number, height: number) =>
  width < layout.breakpoint.tablet || (width < layout.breakpoint.desktop && height <= 500);
export const zoomBottom = layout.dock.bottomMargin + layout.dock.height + canvasControls.gap;

export function canvasControlInsets(
  width: number,
  height: number,
  canvas?: { bottom: number },
  controls: readonly { top: number; bottom: number }[] = [],
) {
  let bottom = compactControls(width, height)
    ? zoomBottom + canvasControls.zoomHeight + canvasControls.clearance : 96;
  // Measured positions include env(safe-area-inset-bottom) and canvas offsets.
  for (const rect of controls) {
    if (canvas && rect.bottom > rect.top && rect.top < canvas.bottom && rect.bottom > canvas.bottom - height) {
      bottom = Math.max(bottom, canvas.bottom - rect.top + canvasControls.clearance);
    }
  }
  return { top: 64, right: 24, bottom, left: 24 };
}
