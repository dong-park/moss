"use client";

import { useRef, useState, type RefObject } from "react";
import { useT } from "@/i18n/Provider";
import { applyCodeKey } from "./codeKeys";

/* code 블록 — 언어 라벨 + monospace 본문. Tab/Shift+Tab/Enter는 codeKeys 정책. */

export function CodeBlock({
  code,
  lang,
  editing,
  onChange,
  onCommitEdit,
  inputRef,
  primary = false,
}: {
  code: string;
  lang?: string;
  editing: boolean;
  onChange: (next: { code: string; lang?: string }) => void;
  onCommitEdit: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  primary?: boolean;
}) {
  const t = useT();
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const [showLangInput, setShowLangInput] = useState(false);

  const setCode = (next: string) => onChange({ code: next, lang });
  const setLang = (next: string) => onChange({ code, lang: next });

  const setCaretSoon = (pos: number) => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.setSelectionRange(pos, pos);
    });
  };

  const onCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Escape") {
      e.preventDefault();
      el.blur();
      return;
    }
    if (e.key === "Tab" || e.key === "Enter") {
      const result = applyCodeKey(el.value, el.selectionStart, el.selectionEnd, e);
      if (result) {
        e.preventDefault();
        if (result.code !== el.value) {
          setCode(result.code);
          setCaretSoon(result.caret);
        }
      }
    }
  };

  return (
    <div className="rounded-[4px] bg-black/[0.03] px-1.5 py-1">
      <div
        className="flex items-center justify-between pb-0.5 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {showLangInput ? (
          <input
            autoFocus
            type="text"
            value={lang ?? ""}
            onChange={(e) => setLang(e.target.value)}
            onBlur={() => setShowLangInput(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder={t("capture.code.langPlaceholder")}
            className="bg-transparent outline-none uppercase tracking-wider text-[10px] w-24 placeholder:text-text-soft"
          />
        ) : (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowLangInput(true);
            }}
            className="cursor-pointer hover:text-text"
          >
            {lang || t("capture.code.langPlaceholder")}
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          ref={ref}
          data-card-input={primary ? true : undefined}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={onCodeKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder={t("capture.code.placeholder")}
          rows={Math.max(2, code.split("\n").length)}
          spellCheck={false}
          className="font-mono text-[12px] leading-5 text-text w-full resize-none bg-transparent outline-none placeholder:text-text-soft"
        />
      ) : (
        <div className="font-mono text-[12px] leading-5 text-text whitespace-pre-wrap">
          {code || <span className="text-text-soft">{t("capture.code.placeholder")}</span>}
        </div>
      )}
    </div>
  );
}
