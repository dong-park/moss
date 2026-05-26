"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";

/**
 * FEAT-boards §8: 보드 삭제 확인 모달.
 * - 확정 시 removeBoardWithUndo 호출 → 5초 undo toast로 이어진다.
 * - 시스템 보드는 트리거 측에서 차단되므로 본 모달은 사용자 보드만 받는다.
 */
export function BoardDeleteDialog() {
  const t = useT();
  const boards = useWorkspace((s) => s.boards);
  const deleteDialogBoardId = useWorkspace((s) => s.deleteDialogBoardId);
  const openDeleteDialog = useWorkspace((s) => s.openDeleteDialog);
  const removeBoardWithUndo = useWorkspace((s) => s.removeBoardWithUndo);

  const target = boards.find((b) => b.id === deleteDialogBoardId) ?? null;
  const open = deleteDialogBoardId !== null;

  const close = () => openDeleteDialog(null);

  const confirm = async () => {
    if (!target) return;
    openDeleteDialog(null);
    await removeBoardWithUndo(target.id);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-5 shadow-card-lift focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="text-base font-semibold text-text">
            {t("workspace.boardPicker.deleteConfirm")}
          </Dialog.Title>
          <Dialog.Description className="mt-2 max-w-sm text-sm text-text-muted">
            {t("workspace.boardPicker.deleteDescription")}
          </Dialog.Description>
          {target && (
            <p className="mt-3 text-sm text-text">
              <span className="text-text-soft">⇢ </span>
              <span className="font-medium">
                {target.name.trim() === ""
                  ? t("workspace.boardPicker.unnamed")
                  : target.name}
              </span>
            </p>
          )}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-panel"
            >
              {t("workspace.boardPicker.deleteCancel")}
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              className="cursor-pointer rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              data-board-delete-confirm
            >
              {t("workspace.boardPicker.deleteConfirmAction")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
