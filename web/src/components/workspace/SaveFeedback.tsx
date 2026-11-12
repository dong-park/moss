"use client";

import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { useCollab } from "@/state/collab";
import { normalizeBoardId } from "@/state/boardIds";
import { boardSavePhase, retryBoardSave, useSaveFeedback } from "@/state/saveFeedback";

/** Shared by the board and expanded memo. Connectivity is never a durable server acknowledgement. */
export function SaveFeedback({ explainClose = false }: { explainClose?: boolean }) {
  const t = useT();
  const boardId = useWorkspace((s) => s.currentBoardId);
  const board = useSaveFeedback((s) => s.boards[normalizeBoardId(boardId)]);
  const phase = boardSavePhase(board);
  const collabBoard = useCollab((s) => s.boardId);
  const status = useCollab((s) => s.status);
  const error = useCollab((s) => s.error);
  const shared = collabBoard !== null && collabBoard === boardId;
  const localLabel = {
    unknown: t("saveFeedback.unknown"), saving: t("saveFeedback.saving"),
    saved: t("saveFeedback.saved"), error: t("saveFeedback.error"),
  }[phase];
  const sharingLabel = error ? t("saveFeedback.syncError") : status === "connected"
    ? t("saveFeedback.syncConnected") : status === "connecting"
      ? t("saveFeedback.syncConnecting") : t("saveFeedback.syncDisconnected");
  return (
    <div data-save-feedback className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] text-text-soft">
      {explainClose && <span>{t("saveFeedback.autosaveClose")}</span>}
      <span role="status" aria-live="polite" aria-atomic="true">
        {localLabel}
      </span>
      {!!board?.document?.failed.length && <span>{t("saveFeedback.documentError")}</span>}
      {Object.entries(board ?? {}).some(([key, resource]) => key !== "document" && resource.failed.length > 0)
        && <span>{t("saveFeedback.mirrorError")}</span>}
      {phase === "error" && <button type="button" className="min-h-11 shrink-0 cursor-pointer rounded px-2 underline"
        onClick={() => void retryBoardSave(boardId)}>{t("saveFeedback.retry")}</button>}
      {shared && <span title={t("saveFeedback.serverUnconfirmed")}>
        {sharingLabel}
      </span>}
    </div>
  );
}
