"use client";

import { create } from "zustand";
import { runAsUserAction, useWorkspace, type Card } from "@/state/workspace";
import { memoFace } from "./cards/text/face";
import { fillLinkMemo } from "./linkMemo";
import { isConnectableCard, nearestSide } from "./connectors/geometry";

export type MobileOperation =
  | { kind: "idle" }
  | { kind: "link"; cardId: string; boardId: string; originalUrl: string; token: number }
  | { kind: "connect"; cardId: string; boardId: string }
  | { kind: "resize"; cardId: string; boardId: string };
let token = 0;
export function linkUrl(card: Card): string | null {
  if (card.kind !== "text") return null;
  const face = memoFace(card.content);
  return face.t === "link" ? face.url : face.t === "linkEmpty" ? "" : null;
}
export const useMobileCanvas = create<{
  operation: MobileOperation;
  close: () => void;
  editLink: (id: string) => void;
  connect: (id: string) => void;
  resize: (id: string) => void;
}>((set) => {
  const start = (id: string) => {
    const ws = useWorkspace.getState();
    const card = ws.cards.find((c) => c.id === id);
    if (!card || ws.penMode) return null;
    ws.selectOne(id);
    ws.setEditing(null);
    return { card, boardId: ws.currentBoardId };
  };
  return {
    operation: { kind: "idle" },
    close: () => set({ operation: { kind: "idle" } }),
    editLink: (id) => {
      const context = start(id);
      if (!context) return;
      const url = linkUrl(context.card);
      if (url === null) return;
      set({ operation: { kind: "link", cardId: id, boardId: context.boardId, originalUrl: url, token: ++token } });
    },
    connect: (id) => {
      const context = start(id);
      if (context && isConnectableCard(context.card)) set({ operation: { kind: "connect", cardId: id, boardId: context.boardId } });
    },
    resize: (id) => {
      const context = start(id);
      if (context) set({ operation: { kind: "resize", cardId: id, boardId: context.boardId } });
    },
  };
});

/** A draft never reaches the shared document before the explicit commit. */
export function commitMobileLink(operation: Extract<MobileOperation, { kind: "link" }>, draft: string): "saved" | "invalid" | "conflict" | "missing" {
  const ws = useWorkspace.getState();
  const card = ws.cards.find((c) => c.id === operation.cardId);
  if (!card || ws.currentBoardId !== operation.boardId) return "missing";
  // Preview metadata can arrive during editing; only a changed URL/type conflicts.
  if (linkUrl(card) !== operation.originalUrl) return "conflict";
  if (draft.trim() === operation.originalUrl && operation.originalUrl !== "") return "saved";
  return runAsUserAction(() => fillLinkMemo(card.id, draft)) ? "saved" : "invalid";
}

export function finishMobileConnection(targetId: string): boolean {
  const operation = useMobileCanvas.getState().operation;
  if (operation.kind !== "connect") return false;
  const ws = useWorkspace.getState();
  const source = ws.cards.find((c) => c.id === operation.cardId);
  const target = ws.cards.find((c) => c.id === targetId);
  if (ws.currentBoardId !== operation.boardId || !source || !isConnectableCard(source)) {
    useMobileCanvas.getState().close();
    return true;
  }
  if (!target || target.id === source.id || !isConnectableCard(target)) return true;
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + (source.height ?? source.width) / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + (target.height ?? target.width) / 2 };
  runAsUserAction(() => ws.connectCards(source.id, nearestSide(source, targetCenter), target.id, nearestSide(target, sourceCenter)));
  ws.selectOne(source.id);
  useMobileCanvas.getState().close();
  return true;
}

export function reconcileMobileOperation() {
  const operation = useMobileCanvas.getState().operation;
  if (operation.kind === "idle") return;
  const ws = useWorkspace.getState();
  if (ws.penMode || ws.view !== "canvas" || ws.currentBoardId !== operation.boardId || !ws.cards.some((c) => c.id === operation.cardId) || ws.selectedIds.length !== 1 || ws.selectedIds[0] !== operation.cardId) useMobileCanvas.getState().close();
}
