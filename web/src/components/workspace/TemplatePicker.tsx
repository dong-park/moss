"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import { TEMPLATES, type Template } from "@/templates";
import { useWorkspace } from "@/state/workspace";
import { TemplatePreview } from "./TemplatePreview";

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * FEAT-templates §6: 새 보드 만들 때 띄우는 5종 템플릿 picker.
 *
 * - ESC / 외부 클릭 = 취소 → 보드 생성 안 함 (AC-2).
 * - 카드 클릭 또는 키보드 Enter = 그 템플릿으로 보드 생성 + 자동 전환 (AC-1).
 * - 카피 톤: "정답 제공 아님, 흐름 제안" (AC-3).
 */
export function TemplatePicker({ open, onOpenChange }: TemplatePickerProps) {
  const t = useT();
  const createBoardFromTemplate = useWorkspace(
    (s) => s.createBoardFromTemplate,
  );
  const titleId = useId();
  const descId = useId();
  const [focusIdx, setFocusIdx] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setFocusIdx(0);
    onOpenChange(next);
  };

  const apply = async (template: Template) => {
    await createBoardFromTemplate(template.id, "", t);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cols = 3;
    const total = TEMPLATES.length;
    let next = focusIdx;
    if (e.key === "ArrowRight") next = (focusIdx + 1) % total;
    else if (e.key === "ArrowLeft") next = (focusIdx - 1 + total) % total;
    else if (e.key === "ArrowDown") next = Math.min(focusIdx + cols, total - 1);
    else if (e.key === "ArrowUp") next = Math.max(focusIdx - cols, 0);
    else return;
    e.preventDefault();
    setFocusIdx(next);
    const btn = gridRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-template-card]",
    )[next];
    btn?.focus();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-6 shadow-modal outline-none"
        >
          <Dialog.Title
            id={titleId}
            className="text-base font-semibold text-text"
          >
            {t("templates.picker.title")}
          </Dialog.Title>
          <Dialog.Description
            id={descId}
            className="mt-1 text-sm leading-relaxed text-text-soft"
          >
            {t("templates.picker.description")}
          </Dialog.Description>

          <div
            ref={gridRef}
            role="listbox"
            aria-label={t("templates.picker.title")}
            onKeyDown={handleKeyDown}
            className="mt-5 grid grid-cols-3 gap-3"
          >
            {TEMPLATES.map((tpl, idx) => (
              <button
                key={tpl.id}
                data-template-card
                data-template-id={tpl.id}
                role="option"
                aria-selected={focusIdx === idx}
                onClick={() => void apply(tpl)}
                onFocus={() => setFocusIdx(idx)}
                tabIndex={focusIdx === idx ? 0 : -1}
                className="group flex cursor-pointer flex-col items-start gap-2 rounded-md border border-border bg-panel/40 p-3 text-left transition-colors hover:border-border-strong hover:bg-panel focus:border-accent-lime focus:outline-none"
              >
                <div className="flex w-full justify-center py-1">
                  <TemplatePreview id={tpl.id} />
                </div>
                <div className="text-sm font-medium text-text">
                  {t(tpl.nameKey)}
                </div>
                <div className="text-xs leading-snug text-text-soft">
                  {t(tpl.descriptionKey)}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-panel"
              >
                {t("templates.picker.cancel")}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
