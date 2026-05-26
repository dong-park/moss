"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import type { Board } from "@/state/db/schema";
import { TemplatePicker } from "./TemplatePicker";
import { BoardDeleteDialog } from "./BoardDeleteDialog";
import { BoardUndoToast } from "./BoardUndoToast";

// 단축키(Cmd+N)와 "+ 새 보드" 진입점이 같은 모달을 공유하기 위해 store 상태 사용.

/**
 * FEAT-boards · 상단 헤더 보드 선택 드롭다운.
 * - 시스템 보드 "머무는 생각" 첫 항목 고정 (체크 마크 + 시스템 배지, 삭제·rename 불가)
 * - 사용자 보드 최근 수정 순
 * - 빈 이름 → "(이름 없는 보드)" placeholder
 * - 트리거 더블클릭 = 인플레이스 이름 편집 (시스템 보드 제외)
 * - "+ 새 보드" — TemplatePicker(FEAT-templates) 모달 진입 → 5종 중 선택 시 새 보드 생성
 */
export function BoardPicker() {
  const t = useT();
  const boards = useWorkspace((s) => s.boards);
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const setCurrentBoard = useWorkspace((s) => s.setCurrentBoard);
  const renameBoard = useWorkspace((s) => s.renameBoard);
  const requestRenameBoard = useWorkspace((s) => s.requestRenameBoard);
  const openDeleteDialog = useWorkspace((s) => s.openDeleteDialog);
  const pendingRenameBoardId = useWorkspace((s) => s.pendingRenameBoardId);
  const clearRenameRequest = useWorkspace((s) => s.clearRenameRequest);
  const templatePickerOpen = useWorkspace((s) => s.templatePickerOpen);
  const setTemplatePickerOpen = useWorkspace((s) => s.setTemplatePickerOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isSystem = currentBoardId === SYSTEM_BOARD_ID;
  const currentBoard = boards.find((b) => b.id === currentBoardId) ?? null;

  const labelFor = (board: Board): string =>
    board.name.trim() === ""
      ? t("workspace.boardPicker.unnamed")
      : board.name;

  const triggerLabel = isSystem
    ? t("workspace.boardPicker.system")
    : currentBoard
    ? labelFor(currentBoard)
    : t("workspace.boardPicker.unnamed");

  // 트리거 인플레이스 편집
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (isSystem || !currentBoard) return;
    setDraft(currentBoard.name);
    setEditing(true);
  };

  // 컨텍스트 메뉴 "이름 변경" 클릭 → store가 setCurrentBoard 후 신호. boardPicker는 진입 처리.
  // 외부 store 신호 → 내부 폼 상태 초기화. useEffect 안 setState가 정당한 use case.
  useEffect(() => {
    if (
      pendingRenameBoardId &&
      currentBoard &&
      pendingRenameBoardId === currentBoard.id
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(currentBoard.name);
      setEditing(true);
      clearRenameRequest();
    }
  }, [pendingRenameBoardId, currentBoard, clearRenameRequest]);

  const commitEdit = async () => {
    if (!editing || !currentBoard) return;
    setEditing(false);
    if (draft !== currentBoard.name) {
      await renameBoard(currentBoard.id, draft);
    }
  };

  const cancelEdit = () => setEditing(false);

  return (
    <DropdownMenu.Root>
      <div className="flex items-center gap-1.5">
        {editing && currentBoard ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            aria-label={t("workspace.boardPicker.renameInput")}
            className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent-lime"
          />
        ) : (
          <DropdownMenu.Trigger asChild>
            <button
              ref={triggerRef}
              data-board-picker-trigger
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text transition-colors hover:bg-panel data-[state=open]:bg-panel"
              aria-label={t("workspace.boardPicker.label")}
              onDoubleClick={startEdit}
            >
              <span>{triggerLabel}</span>
              <span className="text-text-soft">▾</span>
            </button>
          </DropdownMenu.Trigger>
        )}

        {isSystem && (
          <span className="text-xs text-text-soft">
            {t("workspace.boardPicker.systemNote")}
          </span>
        )}
      </div>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-[var(--z-panel)] min-w-56 rounded-lg border border-border bg-bg p-1 shadow-card-lift"
        >
          {/* 시스템 보드 — 항상 첫 항목 */}
          <DropdownMenu.Item
            className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel"
            onSelect={() => void setCurrentBoard(SYSTEM_BOARD_ID)}
          >
            <span className="flex items-center gap-2">
              <span>{t("workspace.boardPicker.system")}</span>
              <span className="rounded-sm bg-accent-lime/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                {t("workspace.boardPicker.systemBadge")}
              </span>
            </span>
            {isSystem && <span className="text-accent-lime">✓</span>}
          </DropdownMenu.Item>

          {boards.map((board) => (
            <ContextMenu.Root key={board.id}>
              <ContextMenu.Trigger asChild>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel"
                  onSelect={() => void setCurrentBoard(board.id)}
                  data-board-item-id={board.id}
                >
                  <span>{labelFor(board)}</span>
                  {board.id === currentBoardId && (
                    <span className="text-accent-lime">✓</span>
                  )}
                </DropdownMenu.Item>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content
                  className="z-[var(--z-panel)] min-w-40 rounded-lg border border-border bg-bg p-1 shadow-card-lift"
                >
                  <ContextMenu.Item
                    className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel"
                    onSelect={() => void requestRenameBoard(board.id)}
                  >
                    {t("workspace.boardPicker.rename")}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-red-600 outline-none transition-colors data-[highlighted]:bg-panel"
                    onSelect={() => openDeleteDialog(board.id)}
                  >
                    {t("workspace.boardPicker.delete")}
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-text-muted outline-none transition-colors data-[highlighted]:bg-panel"
            onSelect={() => setTemplatePickerOpen(true)}
          >
            <span className="text-base leading-none">+</span>
            <span>{t("workspace.boardPicker.newBoard")}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
      />
      <BoardDeleteDialog />
      <BoardUndoToast />
    </DropdownMenu.Root>
  );
}
