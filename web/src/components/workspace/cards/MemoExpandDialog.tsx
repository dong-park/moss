"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { ExpandedMarkdownEditor } from "./_shared/MarkdownEditor";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-expand — 메모(text) 카드 펼치기 모달.
 *
 * 카드의 펼치기 버튼이 setExpandedCard(id)로 연다. 여기서는 expandedCardId를
 * 구독해 해당 카드를 크게(거의 전체 화면) 편집한다. 상단 서식 프리셋 툴바 +
 * Milkdown 본문(ExpandedMarkdownEditor). 편집은 setContent로 실시간 반영·영속.
 *
 * 닫기: Esc / 오버레이 클릭 / 완료 버튼 → setExpandedCard(null).
 * 마운트는 page.tsx 루트에서 1회 (전역 오버레이, BoardDeleteDialog와 동일 패턴).
 * ───────────────────────────────────────────────────────────── */
export function MemoExpandDialog() {
  const t = useT();
  const expandedCardId = useWorkspace((s) => s.expandedCardId);
  const setExpandedCard = useWorkspace((s) => s.setExpandedCard);
  const setContent = useWorkspace((s) => s.setContent);
  // expandedCardId가 가리키는 카드만 좁혀 구독 — 다른 카드 변경에 리렌더되지 않게.
  const card = useWorkspace((s) =>
    s.expandedCardId
      ? (s.cards.find((c) => c.id === s.expandedCardId) ?? null)
      : null,
  );

  // id는 있는데 카드가 사라진 경우(삭제 등) — store 정리가 처리하지만 방어적으로 닫힘.
  const open = expandedCardId !== null && card !== null;
  const close = () => setExpandedCard(null);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex h-[80vh] w-[90vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-card-lift focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <Dialog.Title className="text-sm font-semibold text-text">
              {t("workspace.memoEditor.title")}
            </Dialog.Title>
            <Dialog.Close
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-soft transition-colors hover:bg-panel hover:text-text"
              aria-label={t("workspace.memoEditor.close")}
            >
              ✕
            </Dialog.Close>
          </div>

          {card && (
            <ExpandedMarkdownEditor
              key={card.id}
              value={card.content}
              onChange={(md) => setContent(card.id, md)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
