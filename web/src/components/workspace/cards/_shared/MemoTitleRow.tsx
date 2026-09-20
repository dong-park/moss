"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-title — 메모 제목 줄. 앞면(읽기 전용)과 창(편집 가능)이 같은
 * 컴포넌트로 그린다(AC-5). 높이는 [[MEMO_TITLE_ROW_HEIGHT]] 상수로 고정,
 * white-space:nowrap + ellipsis라 제목 길이가 높이를 바꾸지 않는다(AC-6).
 *
 * 펜 1:1: 이 줄은 본문 컬럼(relative, 펜 overlay 기준 박스) 바깥 위에 붙는다.
 * 제목을 달거나 지워도 본문 컬럼의 className·style은 하나도 바꾸지 않는다(AC-4).
 * 폭·좌우 여백은 본문 컬럼과 같은 720px·padding 9px로 왼쪽 끝이 맞는다(§7).
 *
 * 앞면은 제목이 없으면 이 줄을 아예 그리지 않는다(AC-2). 창은 항상 그리고
 * 편집 가능하다 — placeholder는 앞면이 아니라 창에서만 보인다(AC-3).
 * ───────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import {
  MEMO_CONTENT_WIDTH,
  MEMO_TITLE_ROW_HEIGHT,
} from "./memoLayout";

export function MemoTitleRow({
  title,
  editable = false,
  onCommit,
  onEnter,
  onArrowDown,
}: {
  title: string;
  editable?: boolean;
  onCommit?: (title: string) => void;
  /** Enter — 커서를 본문 맨 앞으로 보낸다(AC-7). */
  onEnter?: () => void;
  /** 본문 맨 앞에서 위 화살표의 역방향 — 제목 줄 끝으로 온다(AC-7). */
  onArrowDown?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드 진입 시 제목 줄에 포커스 — 프롭은 그대로 두고 effect로만 잡는다.
  useEffect(() => {
    if (editable) inputRef.current?.focus();
  }, [editable]);

  const style: React.CSSProperties = {
    width: MEMO_CONTENT_WIDTH,
    height: MEMO_TITLE_ROW_HEIGHT,
    padding: "0 9px",
  };

  if (!editable && !title) return null; // AC-2: 앞면은 빈 제목 줄을 그리지 않는다.

  if (!editable) {
    return (
      <div
        className="moss-md select-none overflow-hidden whitespace-nowrap text-ellipsis text-[15px] font-bold text-text"
        style={style}
      >
        {title}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      data-memo-title-input
      className="moss-md w-full border-none bg-transparent text-[15px] font-bold text-text outline-none placeholder:text-text-faint"
      style={style}
      value={title}
      placeholder={t("workspace.memo.title.placeholder")}
      aria-label={t("workspace.memo.title.label")}
      onChange={(e) => onCommit?.(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onArrowDown?.();
        }
      }}
    />
  );
}
