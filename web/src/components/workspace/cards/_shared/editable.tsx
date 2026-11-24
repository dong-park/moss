"use client";

import { useEffect, useRef } from "react";
import { isCommitEnter, useImeSafeBlur } from "../../ime";

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
  // 한글 조합 중 blur면 확정된 글자로 저장한다(T11).
  const onBlur = useImeSafeBlur<HTMLInputElement>(() => onCommit());

  if (editing) {
    return (
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape" || isCommitEnter(e)) {
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
  const onBlur = useImeSafeBlur<HTMLTextAreaElement>(() => onCommit());

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
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
