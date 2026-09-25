"use client";

import { useLayoutEffect, useRef } from "react";
import {
  TEXT_SIZE_PX,
  TEXTBOX_PADDING_X,
  useWorkspace,
} from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import type { CardContentProps } from "../_shared/types";
import { TextStyleToolbar } from "./TextStyleToolbar";
import { TEXT_DEFAULT_COLOR } from "./style";

/* ─────────────────────────────────────────────────────────────
 * FEAT-text-tool — 캔버스 위 평문 텍스트(textbox).
 *
 * 종이·제목·그림자 없음. 편집 시 <textarea>(자동 높이), 비편집 시
 * white-space: pre-wrap 텍스트. 자동 폭이면 숨은 span으로 내용 폭을 재서
 * store의 width 캐시를 갱신한다(§5). 고정 폭이면 지정 폭에서 줄바꿈한다.
 *
 * 빈 채로 편집을 끝내면 휴지통 없이 즉시 삭제한다(AC-6) — onCommitEdit 대신
 * hardDeleteNote. 되돌리기 대상도 아니다(§2).
 * ───────────────────────────────────────────────────────────── */

export function TextboxCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const setTextMeasuredWidth = useWorkspace((s) => s.setTextMeasuredWidth);
  const hardDeleteNote = useWorkspace((s) => s.hardDeleteNote);
  const isOnlySelected = useWorkspace(
    (s) => s.selectedIds.length === 1 && s.selectedIds[0] === card.id,
  );

  const sizePx = TEXT_SIZE_PX[card.textSize ?? "m"];
  const color = card.color ?? TEXT_DEFAULT_COLOR;
  const autoWidth = card.autoWidth !== false;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useAutoFocusOnEdit(textareaRef, editing);

  // 자동 폭 측정 — 한 줄로 그린 숨은 span의 폭 + 좌우 여백이 카드 폭.
  // 월드 레이어 안이라 getBoundingClientRect는 scale이 곱해진다 → offsetWidth
  // (레이아웃 px, transform 무관)로 월드 폭을 잰다. 웹폰트 로드 후 한 번 더 재측정.
  useLayoutEffect(() => {
    if (!autoWidth) return;
    const measure = () => {
      const span = measureRef.current;
      if (!span) return;
      const w = Math.ceil(span.offsetWidth) + TEXTBOX_PADDING_X * 2;
      setTextMeasuredWidth(card.id, w);
    };
    measure();
    let cancelled = false;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts?.ready) {
      void fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [autoWidth, card.content, card.id, sizePx, setTextMeasuredWidth]);

  // 편집 중 자동 높이 — 내용 높이에 맞춘다(§5 "height는 저장하지 않음").
  useLayoutEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, card.content, sizePx, autoWidth]);

  const commit = () => {
    if (card.content.trim() === "") {
      hardDeleteNote(card.id);
      return;
    }
    onCommitEdit();
  };

  const textStyle: React.CSSProperties = {
    fontSize: sizePx,
    lineHeight: 1.3,
    color,
    whiteSpace: autoWidth ? "pre" : "pre-wrap",
    wordBreak: autoWidth ? "normal" : "break-word",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div
      className="relative w-full"
      style={{ padding: `0 ${TEXTBOX_PADDING_X}px` }}
      data-textbox-root
    >
      {/* 자동 폭 측정용 — 화면 밖, 같은 폰트·줄바꿈 없음. */}
      {autoWidth && (
        <span
          ref={measureRef}
          aria-hidden="true"
          style={{
            ...textStyle,
            position: "absolute",
            left: -99999,
            top: 0,
            whiteSpace: "pre",
            visibility: "hidden",
            pointerEvents: "none",
          }}
        >
          {card.content || " "}
        </span>
      )}

      {editing ? (
        <textarea
          ref={textareaRef}
          data-textbox-input
          aria-label={t("workspace.textbox.inputLabel")}
          value={card.content}
          wrap={autoWidth ? "off" : "soft"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              commit();
            }
          }}
          className="block w-full resize-none border-none bg-transparent p-0 outline-none"
          style={{ ...textStyle, overflow: "hidden" }}
        />
      ) : (
        <div
          data-textbox-text
          style={{ ...textStyle, minHeight: `${Math.round(sizePx * 1.3)}px` }}
        >
          {card.content}
        </div>
      )}

      {isOnlySelected && !editing && <TextStyleToolbar card={card} />}
    </div>
  );
}
