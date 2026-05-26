"use client";

import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────
 * 편집 가능한 단일 라인 / 블록
 * editing=false → div 표시 / editing=true → input/textarea
 * ───────────────────────────────────────────────────────────── */

export function EditableLine({
  value,
  editing,
  placeholder,
  onChange,
  onCommit,
  className,
}: {
  value: string;
  editing: boolean;
  placeholder: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  className: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className={[
          className,
          "w-full bg-transparent outline-none placeholder:text-text-soft",
        ].join(" ")}
      />
    );
  }
  return (
    <div className={className}>
      {value || <span className="text-text-soft">{placeholder}</span>}
    </div>
  );
}

export function EditableBlock({
  value,
  editing,
  placeholder,
  onChange,
  onCommit,
  className,
}: {
  value: string;
  editing: boolean;
  placeholder: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder={placeholder}
        rows={3}
        className={[
          className,
          "w-full resize-none bg-transparent outline-none placeholder:text-text-soft",
        ].join(" ")}
      />
    );
  }
  return (
    <div className={[className, "whitespace-pre-wrap"].join(" ")}>
      {value || <span className="text-text-soft">{placeholder}</span>}
    </div>
  );
}
