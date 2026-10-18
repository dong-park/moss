"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { answerMemberDelete, useMemberDeleteConfirm } from "@/state/share/memberDeleteConfirm";

/**
 * remote-mcp D9: 다른 멤버가 있는 보드를 지우기 전 확인. 확정하면 실행 취소 시간이 지난 뒤
 * 서버 사본을 지워 모두에게서 사라지고, 취소하면 보드를 지우지 않는다.
 */
export function MemberDeleteConfirmDialog() {
  const t = useT();
  const pending = useMemberDeleteConfirm((s) => s.pending);
  const others = pending?.others ?? null;

  return (
    <Dialog.Root open={pending !== null} onOpenChange={(o) => !o && answerMemberDelete(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-5 shadow-card-lift focus:outline-none"
          aria-describedby={undefined}
          data-member-delete-dialog
        >
          <Dialog.Title className="text-base font-semibold text-text">
            {others === null
              ? t("collab.share.deleteMembersUnknown")
              : t("collab.share.deleteMembers", { count: String(others) })}
          </Dialog.Title>
          <Dialog.Description className="mt-2 max-w-sm text-sm text-text-muted">
            {others === null
              ? t("collab.share.deleteMembersBody")
              : t("collab.share.deleteMembersDescription")}
          </Dialog.Description>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => answerMemberDelete(false)}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-panel"
            >
              {t("collab.share.deleteMembersCancel")}
            </button>
            <button
              type="button"
              onClick={() => answerMemberDelete(true)}
              className="cursor-pointer rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              data-member-delete-confirm
            >
              {t("collab.share.deleteMembersConfirm")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
