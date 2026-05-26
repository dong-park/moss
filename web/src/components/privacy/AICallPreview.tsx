"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useWorkspace } from "@/state/workspace";

/**
 * AI 호출 직전 투명 표시 + 명시적 동의 모달 (FEAT-privacy AC-3).
 *
 * pending 상태는 workspace store에서 읽고, useAIGate가 push한다.
 * 앱 최상위에 한 번만 마운트.
 *
 * 톤: 잔잔. 강제·경고 톤 금지.
 */
export function AICallPreview() {
  const pending = useWorkspace((s) => s.pendingAIGate);
  const open = pending !== null;
  const count = pending?.notes.length ?? 0;

  const onConfirm = () => pending?.resolve(true);
  const onCancel = () => pending?.resolve(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-text/20 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-5 shadow-modal outline-none"
        >
          <Dialog.Title className="text-sm font-medium text-text">
            다음 메모를 분석에 사용해도 될까요?
          </Dialog.Title>
          <VisuallyHidden.Root>
            <Dialog.Description>
              AI에 전송될 메모 {count}개를 검토하고 동의 또는 취소합니다.
            </Dialog.Description>
          </VisuallyHidden.Root>

          <p className="mt-1 text-[12px] text-text-soft">
            지금 분석되는 메모 {count}개
          </p>

          <ul className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border bg-panel">
            {pending?.notes.map((n) => (
              <li
                key={n.id}
                className="border-b border-border/60 px-3 py-2 text-[12px] text-text last:border-b-0"
              >
                {n.title}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-md px-3 py-1.5 text-[12px] text-text-muted transition-colors hover:bg-panel"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="cursor-pointer rounded-md bg-text px-3 py-1.5 text-[12px] text-bg transition-opacity hover:opacity-90"
            >
              분석에 사용
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
