"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/state/workspace";
import { makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { useT } from "@/i18n/Provider";
import { cardSurface } from "../_shared/surface";
import { EditableLine } from "../_shared/editable";
import { dialogOpenedFor } from "../_shared/dialogOpened";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * File — 첨부 파일 (모든 MIME). 이름 + 메타 표시.
 *
 * P2-B 키보드 UX (SIDEBAR-CARDS-UX.md §6):
 *   Esc   → commit (EditableLine 내부에서 처리)
 *   Enter → 파일명 commit (EditableLine 내부에서 처리)
 *   Tab   → 파일명 → 설명(있다면) — 현재 설명 필드 없음, 브라우저 기본 동작
 *   Space → 파일 아이콘(확장자 박스) 포커스일 때 파일 피커
 * ───────────────────────────────────────────────────────────── */

export function FileCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const setAttachment = useWorkspace((s) => s.setAttachment);
  const inputRef = useRef<HTMLInputElement>(null);
  // FEAT-card-entry-mode §6: file 자동 포커스 타겟 = [data-card-dropzone].
  // 파일 picker button이 dropzone 역할(Space로 피커 발동, focusable).
  const dropzoneRef = useRef<HTMLButtonElement>(null);
  useAutoFocusOnEdit(dropzoneRef, editing && !card.attachmentRef);

  useEffect(() => {
    if (!editing) return;
    if (card.attachmentRef) return;
    if (dialogOpenedFor.has(card.id)) return;
    dialogOpenedFor.add(card.id);
    const timer = setTimeout(() => inputRef.current?.click(), 0);
    return () => clearTimeout(timer);
  }, [editing, card.attachmentRef, card.id]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filename = makeAttachmentFilename(file.type);
      const ref = await putBlob(filename, file);
      setAttachment(card.id, ref, {
        content: file.name,
        mediaType: file.type,
      });
    } catch (err) {
      console.warn("OPFS putBlob failed", err);
    }
  };

  const ext = (() => {
    if (!card.content) return "FILE";
    const i = card.content.lastIndexOf(".");
    return i > -1 ? card.content.slice(i + 1).toUpperCase() : "FILE";
  })();

  return (
    <div
      className="relative h-full"
      style={{
        borderRadius: 6,
        ...cardSurface("file"),
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onPick}
      />
      {/*
       * 콘텐츠를 file PNG의 폴더 본체 종이 영역(좌상단 폴더 탭 회피)에 비율로 정렬.
       * inset 측정값: top 5% / left 1% / right 3% / bottom 4% (SIDEBAR-CARDS-UX.md §6 P2-B).
       */}
      <div
        className="absolute"
        style={{ top: "5%", left: "1%", right: "3%", bottom: "4%" }}
      >
        <div className="flex items-center gap-3 h-full min-h-0">
          <button
            ref={dropzoneRef}
            type="button"
            data-card-dropzone
            aria-label={t("capture.file.placeholder")}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            onKeyDown={(e) => {
              // Space — 파일 아이콘 포커스일 때 파일 피커 열기.
              // 기본 동작(스크롤)을 막고 click() 호출.
              if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[10px] font-semibold tracking-wider"
            style={{
              background: "rgba(0,0,0,0.06)",
              color: "var(--color-text-muted)",
            }}
          >
            {ext.slice(0, 4)}
          </button>
          <div className="flex-1 min-w-0">
            <EditableLine
              value={card.content}
              editing={editing}
              placeholder={t("capture.file.placeholder")}
              onChange={onChange}
              onCommit={onCommitEdit}
              className="text-[13px] text-text truncate"
            />
            <div className="text-[11px] text-text-soft">
              {card.mediaType ?? (card.attachmentRef ? "" : t("capture.file.notSelected"))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
