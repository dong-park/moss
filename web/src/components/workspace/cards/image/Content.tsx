"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { getBlobUrl, makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { useT } from "@/i18n/Provider";
import { useClipboardWatch } from "../../useClipboardWatch";
import { cardSurface } from "../_shared/surface";
import { dialogOpenedFor } from "../_shared/dialogOpened";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Image — 카드 mount 시 파일 dialog 자동, OPFS putBlob, alt 텍스트 편집
 * ───────────────────────────────────────────────────────────── */

export function ImageCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const setAttachment = useWorkspace((s) => s.setAttachment);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // FEAT-card-entry-mode §6: image 자동 포커스 타겟 = [data-card-dropzone].
  // 첨부 후엔 dropzone이 사라지므로 attachmentRef 없을 때만 활성.
  const dropzoneRef = useRef<HTMLDivElement>(null);
  useAutoFocusOnEdit(dropzoneRef, editing && !card.attachmentRef);

  // T-7: clipboard 자동 채움 시도 (image 종)
  useClipboardWatch("image", card.id);

  // 1) 새 카드 mount 시 1회 자동 dialog
  useEffect(() => {
    if (!editing) return;
    if (card.attachmentRef) return;
    if (dialogOpenedFor.has(card.id)) return;
    dialogOpenedFor.add(card.id);
    // 다음 tick에 click — drop의 user gesture 콘텍스트 유지 시도
    const timer = setTimeout(() => inputRef.current?.click(), 0);
    return () => clearTimeout(timer);
  }, [editing, card.attachmentRef, card.id]);

  // 2) 첨부 → preview URL (async load — setState는 외부 async 시스템과의 동기화)
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const load = async () => {
      const ref = card.attachmentRef;
      if (!ref) {
        if (!cancelled) setPreviewUrl(null);
        return;
      }
      const url = await getBlobUrl(ref);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      createdUrl = url;
      setPreviewUrl(url);
    };
    void load();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [card.attachmentRef]);

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

  // 이미지 영역(placeholder 또는 img) 키보드 — Space로 파일 피커 열기.
  // 현재 클릭과 동등한 효과. 캔버스 단축키와 충돌 회피 위해 stopPropagation+preventDefault.
  const onPickerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.click();
    }
  };
  const onPickerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  return (
    <div
      className="relative h-full"
      style={{
        minHeight: 120,
        borderRadius: 6,
        ...cardSurface("image"),
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      {/*
       * 콘텐츠를 image PNG 종이/사진 박스 영역(10/6/7/7%)에 정렬.
       * spec §6 P2-A 측정값 — 중앙 회색 사진 박스 raw bbox 기준.
       */}
      <div
        className="absolute flex flex-col overflow-hidden"
        style={{ top: "10%", left: "6%", right: "7%", bottom: "7%" }}
      >
        <div
          ref={dropzoneRef}
          role="button"
          tabIndex={0}
          data-card-dropzone
          aria-label={t("capture.image.placeholder")}
          onKeyDown={onPickerKey}
          onClick={onPickerClick}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-1 min-h-0 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-border rounded-[3px] cursor-pointer"
        >
          {previewUrl ? (
            // 카드 높이가 명시되면 img가 남은 공간을 채우며 비율 유지(contain).
            // 명시되지 않은 경우(기본) 200px maxHeight로 thumbnail처럼 표시.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={card.content || ""}
              className="block w-full h-full object-contain"
              style={{ maxHeight: card.height !== undefined ? undefined : 200 }}
              draggable={false}
            />
          ) : (
            <span
              className="text-text-soft text-[11px]"
              style={{ minHeight: 80 }}
            >
              {t("capture.image.placeholder")}
            </span>
          )}
        </div>
        <div className="px-3 py-2 shrink-0">
          {/*
           * FEAT-card-entry-mode §6 — image의 자동 포커스 타겟은 dropzone이므로
           * alt 입력은 mount 시 자동 focus를 발동하지 않는다. EditableLine 대신 inline input을 써
           * 부모(dropzone) focus를 빼앗기지 않게 한다. 사용자 클릭/Tab으로 명시 진입.
           */}
          {editing ? (
            <input
              type="text"
              value={card.content}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder={t("capture.image.altPlaceholder")}
              className="text-[12px] text-text-muted w-full bg-transparent outline-none placeholder:text-text-soft"
            />
          ) : (
            <div className="text-[12px] text-text-muted">
              {card.content || (
                <span className="text-text-soft">
                  {t("capture.image.altPlaceholder")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
