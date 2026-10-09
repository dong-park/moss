"use client";

import { useRef } from "react";
import { CARD_MAX_HEIGHT, CARD_MIN_HEIGHT, PHOTO_CAPTION_MAX, useWorkspace } from "@/state/workspace";
import { storePhoto } from "../../canvasCapture";
import { usePhotoUrl } from "./usePhotoUrl";
import { useT } from "@/i18n/Provider";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * FEAT-photo-card — 메모 종이 없이 사진 자체가 카드.
 *
 * attachmentRef의 blob을 resolveAttachment로 받아 그린다(ready/pending/missing).
 * 캡션(content 평문)이 있으면 사진 아래에 흰 여백 한 줄을 그린다 — 카드 상자
 * 밖으로 흘러넘친다(카드 높이·비율에 영향 없음). 캡션 입력칸은 editingId가 이
 * 카드일 때 사진 아래에 뜨고, Enter·바깥 클릭 저장 / Esc 원복.
 * ───────────────────────────────────────────────────────────── */

/** 캡션 정규화 — 줄바꿈 제거, trim, 200자 절단(spec 경계 조건). */
export function normalizeCaption(raw: string): string {
  return raw.replace(/[\r\n]+/g, " ").trim().slice(0, PHOTO_CAPTION_MAX);
}

export function PhotoCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  const res = usePhotoUrl(card.attachmentRef);

  useAutoFocusOnEdit(inputRef, editing);


  const caption = card.content;

  const commit = (value: string) => {
    const next = normalizeCaption(value);
    if (next !== card.content) onChange(next);
    onCommitEdit();
  };

  if (!card.attachmentRef) return <EmptyPhoto cardId={card.id} width={card.width} />;

  return (
    <div className="relative h-full w-full" data-photo-root>
      <div className="h-full w-full overflow-hidden rounded-[6px] bg-panel" data-photo-image>
        {res.state === "ready" && res.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={res.url}
            alt={caption || t("cards.photo.lightboxLabel")}
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        ) : (
          <div
            data-photo-placeholder={res.state}
            className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-text-soft"
          >
            {res.state === "pending" ? t("cards.photo.pending") : null}
            {res.state === "missing" ? t("cards.photo.missing") : null}
          </div>
        )}
      </div>

      {(caption || editing) && (
        <div
          data-photo-caption
          className="absolute left-0 right-0 top-full z-10 rounded-b-[4px] bg-white shadow-card"
        >
          {editing ? (
            <input
              ref={inputRef}
              data-photo-caption-input
              defaultValue={caption}
              maxLength={PHOTO_CAPTION_MAX}
              placeholder={t("cards.photo.caption.placeholder")}
              aria-label={t("cards.photo.caption.edit")}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  e.currentTarget.value = caption;
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => commit(e.currentTarget.value)}
              className="block w-full truncate border-none bg-transparent px-1.5 py-1 text-center text-xs text-text outline-none"
            />
          ) : (
            <div
              data-photo-caption-text
              className="truncate px-1.5 py-1 text-center text-xs text-text"
              title={caption}
            >
              {caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PHOTO_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

/**
 * 빈 사진 카드 (spec/card-faces.md) — 도크 사진 버튼이 만든다. 가운데 버튼을 누르면 파일 창이 뜨고,
 * 고른 사진을 이 카드에 붙인 뒤 높이를 사진 비율로 맞춘다. 취소면 빈 카드로 남는다.
 * 버튼 밖 자리는 카드 선택·드래그다.
 */
function EmptyPhoto({ cardId, width }: { cardId: string; width: number }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const setAttachment = useWorkspace((s) => s.setAttachment);
  const resizeCard = useWorkspace((s) => s.resizeCard);

  const onPicked = async (file: File | undefined) => {
    if (!file) return;
    const photo = await storePhoto(file);
    if (!photo) return; // 형식·크기 거부는 storePhoto가 토스트로 알린다.
    setAttachment(cardId, photo.ref, { mediaType: photo.mediaType });
    if (photo.naturalW && photo.naturalH) {
      const h = Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, (width * photo.naturalH) / photo.naturalW));
      resizeCard(cardId, { width, height: h });
    }
  };

  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-[6px] border border-dashed border-border bg-panel"
      data-photo-root
      data-photo-empty
    >
      <button
        type="button"
        data-photo-pick
        onClick={() => fileRef.current?.click()}
        className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs text-text-soft shadow-card hover:text-text"
      >
        {t("cards.photo.pick")}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // 같은 파일을 다시 골라도 change가 오게.
          void onPicked(file);
        }}
      />
    </div>
  );
}
