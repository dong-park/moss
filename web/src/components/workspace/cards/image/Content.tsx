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

export function ImageCardContent({ card, editing }: CardContentProps) {
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

  /*
   * 종이(PNG) 박스는 root에 background `contain`으로 그려진다 — root 박스 비율이
   * PNG 비율과 다르면(가져온/레거시 카드 등) 종이가 좌우/상하로 레터박스되어
   * root보다 좁/짧아진다. 콘텐츠를 root의 %로 깔면 그 종이 밖으로 흘러넘친다(버그).
   * → root 실측 후 contain 종이 사각형을 직접 계산해 그 안에 콘텐츠를 앉힌다.
   */
  const PAPER_W = 941;
  const PAPER_H = 1081;
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale =
    box.w > 0 && box.h > 0 ? Math.min(box.w / PAPER_W, box.h / PAPER_H) : 0;
  const paperW = PAPER_W * scale;
  const paperH = PAPER_H * scale;
  const paperLeft = (box.w - paperW) / 2;
  const paperTop = (box.h - paperH) / 2;

  // 이미지 영역(placeholder 또는 img) 키보드 — Space로 파일 피커 열기.
  // 현재 클릭과 동등한 효과. 캔버스 단축키와 충돌 회피 위해 stopPropagation+preventDefault.
  const onPickerKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.click();
    }
  };
  // 이미지 영역에서 시작한 드래그로 카드를 이동할 수 있게 mousedown을 막지 않는다.
  // (이전엔 stopPropagation으로 DraggableCard 드래그 시작이 차단됐다.)
  // 대신 mousedown 좌표를 기록해, 임계를 넘긴 드래그면 click에서 피커를 열지 않는다.
  const PICK_DRAG_THRESHOLD = 3;
  const pickerDownPos = useRef<{ x: number; y: number } | null>(null);
  const onPickerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    pickerDownPos.current = { x: e.clientX, y: e.clientY };
  };
  const onPickerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const start = pickerDownPos.current;
    pickerDownPos.current = null;
    if (
      start &&
      Math.hypot(e.clientX - start.x, e.clientY - start.y) >
        PICK_DRAG_THRESHOLD
    ) {
      // 드래그였음 — 카드 이동만 하고 파일 피커는 열지 않는다.
      return;
    }
    e.stopPropagation();
    inputRef.current?.click();
  };

  return (
    <div ref={rootRef} className="relative h-full" style={{ minHeight: 120 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      {/*
       * 종이 박스 — root 안에서 contain 레터박스된 실측 사각형. background도 여기에 둬
       * 콘텐츠 좌표계(아래 %)와 종이가 항상 일치한다(넘침 방지).
       */}
      {paperW > 0 && (
        <div
          className="absolute"
          style={{
            left: paperLeft,
            top: paperTop,
            width: paperW,
            height: paperH,
            borderRadius: 6,
            ...cardSurface("image"),
          }}
        >
          {/*
           * 사진(회색) 박스 영역 — PNG 측정값 bbox(top 18.87 / bottom 13.8 / left 5.31 / right 7.23%).
           * 이미지는 이 박스 안에 contain 되어 회색 종이를 넘지 않는다.
           */}
          <div
            ref={dropzoneRef}
            role="button"
            tabIndex={0}
            data-card-dropzone
            aria-label={t("capture.image.placeholder")}
            onKeyDown={onPickerKey}
            onClick={onPickerClick}
            onMouseDown={onPickerMouseDown}
            className="absolute overflow-hidden flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-border rounded-[3px] cursor-pointer"
            style={{ top: "18.87%", bottom: "13.8%", left: "5.31%", right: "7.23%" }}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={card.content || ""}
                className="block w-full h-full object-contain"
                style={{ backgroundColor: "#fff" }}
                draggable={false}
              />
            ) : (
              // 이미지 미첨부 시 빈 영역 — 클릭하면 파일 피커.
              <span aria-hidden />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
