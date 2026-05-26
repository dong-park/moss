"use client";

import { useRef, type RefObject } from "react";
import { useT } from "@/i18n/Provider";

/* text 블록 — 일반 텍스트. Esc commit / Enter 줄바꿈 / Tab 포커스 이동(들여쓰기 없음). */

export function TextBlock({
  text,
  editing,
  onChange,
  onCommitEdit,
  inputRef,
  primary = false,
}: {
  text: string;
  editing: boolean;
  onChange: (text: string) => void;
  onCommitEdit: () => void;
  /** 진입 자동 포커스 타겟 (all-in-one 첫 text 블록). */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** true면 [data-card-input] — FEAT-card-entry-mode 자동 포커스 타겟. */
  primary?: boolean;
}) {
  const t = useT();
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const rows = Math.max(2, text.split("\n").length);

  if (!editing) {
    return (
      <div className="whitespace-pre-wrap text-[13px] leading-6 text-text">
        {text || <span className="text-text-soft">{t("capture.text.placeholder")}</span>}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      data-card-input={primary ? true : undefined}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommitEdit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder={t("capture.text.placeholder")}
      rows={rows}
      className="w-full resize-none bg-transparent outline-none text-[13px] leading-6 text-text placeholder:text-text-soft"
    />
  );
}
