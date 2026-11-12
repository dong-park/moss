"use client";

import { create } from "zustand";
import { normalizeBoardId } from "./boardIds";

type Retry = () => Promise<unknown>;
interface Resource {
  pending: number[];
  failed: number[];
  coveredThrough: number;
  saved: boolean;
  retry: Retry | null;
}
export type BoardSave = Record<string, Resource>;
export type SavePhase = "unknown" | "saving" | "saved" | "error";
export const useSaveFeedback = create<{ boards: Record<string, BoardSave> }>(() => ({ boards: {} }));
let sequence = 0;

/** Local document and search mirror are independent resources. No network event calls this API. */
export function boardSavePhase(board: BoardSave | undefined): SavePhase {
  const resources = Object.values(board ?? {});
  if (resources.some((r) => r.failed.length)) return "error";
  if (resources.some((r) => r.pending.length)) return "saving";
  // A mirror alone is never evidence that the source document was persisted.
  if (!board?.document?.saved) return "unknown";
  return "saved";
}

export function beginSave(
  boardId: string | null,
  key: string,
  retry: Retry,
  coversPrevious = true,
) {
  const board = normalizeBoardId(boardId);
  const token = ++sequence;
  const change = (fn: (r: Resource) => Resource) => useSaveFeedback.setState((s) => {
    const resource = s.boards[board]?.[key];
    if (!resource) return s;
    return { boards: { ...s.boards, [board]: { ...s.boards[board], [key]: fn(resource) } } };
  });
  useSaveFeedback.setState((s) => {
    const prev = s.boards[board]?.[key];
    return { boards: { ...s.boards, [board]: { ...s.boards[board], [key]: {
      pending: [...(prev?.pending ?? []), token], failed: prev?.failed ?? [],
      coveredThrough: prev?.coveredThrough ?? token - 1, saved: prev?.saved ?? false, retry,
    } } } };
  });
  let finished = false;
  const finish = (result: "success" | "error" | "cancel") => {
    if (finished) return;
    finished = true;
    change((r) => {
      const pending = r.pending.filter((id) => id !== token);
      const failed = result === "error" && token > r.coveredThrough
        ? [...r.failed, token]
        : result === "success" && coversPrevious ? r.failed.filter((id) => id > token) : r.failed;
      return {
        ...r, pending, failed,
        coveredThrough: result === "success" && coversPrevious ? Math.max(r.coveredThrough, token) : r.coveredThrough,
        saved: r.saved || result === "success",
        // Do not keep entire closed documents/editor snapshots alive after a
        // successful save. Only unfinished/failed resources need a retry.
        retry: pending.length || failed.length ? r.retry : null,
      };
    });
  };
  return { success: () => finish("success"), failure: () => finish("error"), cancel: () => finish("cancel") };
}

export async function retryBoardSave(boardId: string | null): Promise<void> {
  const resources = Object.values(useSaveFeedback.getState().boards[normalizeBoardId(boardId)] ?? {});
  // Each callback reads the latest document snapshot or is replaced by the latest mirror patch.
  // Failed edits stay in memory, and a retry failure is recorded by the same write path.
  await Promise.allSettled(resources.filter((r) => r.failed.length).map((r) => r.retry?.()));
}

/** Cancelled/deleted cards cannot leave a retry that would recreate an old row. */
export function forgetSaveResource(key: string): void {
  useSaveFeedback.setState((s) => ({ boards: Object.fromEntries(Object.entries(s.boards).map(([id, resources]) => {
    const next = { ...resources };
    delete next[key];
    return [id, next];
  })) }));
}

export function forgetBoardSave(boardId: string): void {
  useSaveFeedback.setState((s) => {
    const boards = { ...s.boards };
    delete boards[normalizeBoardId(boardId)];
    return { boards };
  });
}
