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
 * 앞면은 읽기 전용일 때 제목이 없으면 이 줄을 아예 그리지 않는다(AC-2).
 * 편집 모드(앞면·창)에서는 제목이 비어도 항상 입력 줄을 그려 앞면에서 새 제목을
 * 만들 수 있게 한다 — placeholder는 편집 가능할 때만 보인다(AC-1·AC-3).
 * ───────────────────────────────────────────────────────────── */

import { t } from "@/i18n";
import {
  MEMO_CONTENT_WIDTH,
  MEMO_TITLE_ROW_HEIGHT,
} from "./memoLayout";

export function MemoTitleRow({
  title,
  editable = false,
  variant = "column",
  placeholder,
  inputRef,
  onCommit,
  onEnter,
  onArrowDown,
  onBlur,
}: {
  title: string;
  editable?: boolean;
  /**
   * `column`은 창에서 쓰는 720px 고정 컬럼 왼쪽 정렬이다.
   * `center`는 앞면 메모지용 — 카드 폭에 맞춰 가운데 정렬한다(2026-09-22 사용자 결정).
   */
  variant?: "column" | "center";
  /** center 변형에서 제목이 비었을 때 보여줄 흐린 글씨. */
  placeholder?: string;
  /** 앞면은 편집 진입 시 이 입력에 포커스를 박는다(FEAT-memo-front-title-only). */
  inputRef?: React.Ref<HTMLInputElement>;
  onCommit?: (title: string) => void;
  /** Enter — 커서를 본문 맨 앞으로 보낸다(AC-5). */
  onEnter?: () => void;
  /** ArrowDown — 본문 맨 앞으로 내려간다(Enter와 같은 목적지). */
  onArrowDown?: () => void;
  /** blur 시 새 포커스 대상(relatedTarget) 전달 — 카드 스코프 blur 가드용(AC-3). */
  onBlur?: (relatedTarget: EventTarget | null) => void;
}) {
  const centered = variant === "center";
  const style: React.CSSProperties = centered
    ? { width: "100%", height: MEMO_TITLE_ROW_HEIGHT, padding: "0 12px", textAlign: "center" }
    : { width: MEMO_CONTENT_WIDTH, height: MEMO_TITLE_ROW_HEIGHT, padding: "0 9px" };

  // AC-2: 컬럼 변형(창)은 빈 제목 줄을 그리지 않는다. 가운데 변형(앞면)은 빈
  // 메모도 흐린 안내 글씨를 보여준다 — 누를 자리가 있어야 제목을 만들 수 있다.
  if (!editable && !title && !centered) return null;

  if (!editable) {
    return (
      <div
        className={[
          "moss-md select-none overflow-hidden whitespace-nowrap text-ellipsis text-[15px] font-bold",
          title ? "text-text" : "text-text-faint",
        ].join(" ")}
        style={style}
      >
        {title || placeholder}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      data-memo-title-input
      className={[
        "moss-md w-full border-none bg-transparent text-[15px] font-bold text-text outline-none placeholder:text-text-faint",
        // 앞면은 포커스 링을 끈다 — globals.css의 `*:focus-visible` 라임 outline이
        // 카드 폭을 꽉 채운 줄 위아래로 초록 선 두 개로 보인다(좌우는 카드가 자름).
        // 깜빡이는 커서가 이미 "여기 치면 된다"를 말한다(2026-09-22 사용자 결정).
        centered ? "focus-visible:outline-none" : "",
      ].join(" ")}
      style={style}
      value={title}
      // 앞면(center)은 읽기 상태와 같은 안내 글씨를 쓴다 — 고치기로 들어가도
      // 줄이 바뀌지 않고 깜빡이는 커서만 생긴다(2026-09-22 사용자 결정).
      placeholder={placeholder ?? t("workspace.memo.title.placeholder")}
      aria-label={t("workspace.memo.title.label")}
      onChange={(e) => onCommit?.(e.target.value)}
      onBlur={(e) => onBlur?.(e.relatedTarget)}
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
