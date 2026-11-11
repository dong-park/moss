import {
  CARD_MAX_HEIGHT, CARD_MAX_WIDTH, CARD_MIN_HEIGHT, CARD_MIN_WIDTH,
  FRAME_MIN_HEIGHT, aspectForKind, clampFrameWidth, runAsUserAction,
  useWorkspace, type Card,
} from "@/state/workspace";
import { normalizeFrameBg, readFrameContent } from "@/state/frameContent";
import { memoFace } from "./cards/text/face";

export type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Dimensions = { width: number; height?: number };
type Resize = Dimensions & { x?: number; y?: number; baseWidth?: number };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function isAutoHeightCard(card: Card): boolean {
  return card.kind === "textbox" || (card.kind === "text" && memoFace(card.content).t !== "paper");
}

/** The same finite, clamp and shape rules serve pointer drags and discrete controls. */
function dimensions(card: Card, next: Resize): Dimensions | undefined {
  if (!Number.isFinite(next.width) || (next.height !== undefined && !Number.isFinite(next.height))) return;
  if (card.kind === "frame") {
    const width = clampFrameWidth(next.baseWidth ?? card.width, next.width);
    const bg = card.attachmentRef ? normalizeFrameBg(readFrameContent(card.content).bg) : undefined;
    return {
      width,
      height: bg ? clamp(Math.round(width * bg.h / bg.w), FRAME_MIN_HEIGHT, CARD_MAX_HEIGHT)
        : clamp(next.height ?? card.height ?? FRAME_MIN_HEIGHT, FRAME_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }
  if (isAutoHeightCard(card)) return { width: clamp(next.width, CARD_MIN_WIDTH, CARD_MAX_WIDTH) };
  const ratio = card.kind === "photo" && card.height && card.height > 0
    ? card.width / card.height : aspectForKind(card.kind);
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const min = Math.max(CARD_MIN_WIDTH, CARD_MIN_HEIGHT * ratio);
  const max = Math.min(CARD_MAX_WIDTH, CARD_MAX_HEIGHT * ratio);
  if (min > max) return;
  const width = clamp(next.width, min, max);
  return { width, height: width / ratio };
}

/** Apply inside an existing drag group or runAsUserAction; never opens a drag group. */
export function applyCardResize(id: string, next: Resize): boolean {
  const state = useWorkspace.getState();
  const card = state.cards.find((c) => c.id === id);
  if (!card || (next.x !== undefined && !Number.isFinite(next.x)) || (next.y !== undefined && !Number.isFinite(next.y))) return false;
  const size = dimensions(card, next);
  if (!size) return false;
  const x = next.x ?? card.x;
  const y = next.y ?? card.y;
  if (size.width === card.width && (size.height === undefined || size.height === card.height) && x === card.x && y === card.y) return false;
  if (card.kind === "frame") {
    state.resizeFrame(id, { ...size, height: size.height!, x, y, baseWidth: next.baseWidth });
  } else if (card.kind === "textbox") {
    if (size.width !== card.width) state.setTextWidth(id, size.width);
    if (x !== card.x || y !== card.y) {
      state.moveCard(id, x, y);
      state.commitMove([id]);
    }
  } else {
    // Auto-height faces keep the current measured height; their content measures again after width changes.
    state.resizeCard(id, { width: size.width, height: size.height ?? card.height ?? CARD_MIN_HEIGHT, x, y });
  }
  return true;
}

export function finishCardResize(id: string): void {
  const state = useWorkspace.getState();
  if (state.cards.find((c) => c.id === id)?.kind === "frame") {
    state.resolveMembership(state.cards.filter((c) => c.kind !== "frame").map((c) => c.id));
  }
}

/** One numeric/stepper action = one undo step. Invalid and clamped no-ops never open a step. */
export function resizeCardDimensions(id: string, next: Dimensions): Dimensions | undefined {
  const card = useWorkspace.getState().cards.find((c) => c.id === id);
  if (!card) return;
  const size = dimensions(card, next);
  if (!size) return;
  if (size.width === card.width && (size.height === undefined || size.height === card.height)) return size;
  runAsUserAction(() => {
    if (applyCardResize(id, size)) finishCardResize(id);
  });
  const updated = useWorkspace.getState().cards.find((c) => c.id === id);
  return updated ? { width: updated.width, height: updated.height } : undefined;
}

/** Opposite edges stay anchored to the drag-start geometry, including at clamp limits. */
export function resizeFromHandle(card: Card, measuredHeight: number, dir: ResizeDirection, dx: number, dy: number): Resize {
  const autoHeight = isAutoHeightCard(card);
  const height = card.kind === "text" && !autoHeight ? card.width : (card.height ?? measuredHeight);
  let width = dir.includes("w") ? card.width - dx : card.width + dx;
  let nextHeight = height;
  if (card.kind === "frame") {
    if (!dir.includes("e") && !dir.includes("w")) width = card.width;
    if (dir.includes("s")) nextHeight += dy;
    if (dir.includes("n")) nextHeight -= dy;
  } else if (!autoHeight && (dir === "n" || dir === "s")) {
    const ratio = card.kind === "photo" && card.height ? card.width / card.height : aspectForKind(card.kind);
    width = (height + (dir === "s" ? dy : -dy)) * ratio;
  }
  const size = dimensions(card, { width, height: nextHeight, baseWidth: card.width });
  if (!size) return { width: NaN };
  return {
    ...size,
    x: card.x + (dir.includes("w") ? card.width - size.width : 0),
    y: card.y + (!autoHeight && dir.includes("n") ? height - size.height! : 0),
    baseWidth: card.width,
  };
}
