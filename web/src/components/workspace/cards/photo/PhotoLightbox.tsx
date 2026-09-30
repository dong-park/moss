"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n/Provider";
import {
  onFilesMapChange,
  resolveAttachment,
  type AttachmentResolution,
} from "@/state/share/attachments";
import type { Card } from "@/state/workspace";

/* ─────────────────────────────────────────────────────────────
 * FEAT-photo-card — 더블클릭으로 사진을 크게 보는 Radix Dialog.
 *
 * MemoExpandDialog가 카드 kind가 photo면 이 컴포넌트를 그린다. Esc·바깥 클릭은
 * Radix Dialog의 onOpenChange(false) → onClose. 캡션이 있으면 아래 한 줄.
 * ───────────────────────────────────────────────────────────── */

type Resolved =
  | { state: "loading"; url: null }
  | AttachmentResolution;

export function PhotoLightbox({
  card,
  onClose,
}: {
  card: Card;
  onClose: () => void;
}) {
  const t = useT();
  const urlRef = useRef<string | null>(null);
  const [res, setRes] = useState<Resolved>({ state: "loading", url: null });
  const ref = card.attachmentRef;

  useEffect(() => {
    if (!ref) {
      setRes({ state: "missing", url: null });
      return;
    }
    let cancelled = false;
    const apply = (next: AttachmentResolution) => {
      if (cancelled) return;
      if (urlRef.current && urlRef.current !== next.url) {
        URL.revokeObjectURL(urlRef.current);
      }
      urlRef.current = next.url;
      setRes(next);
    };
    const run = () => {
      void resolveAttachment(ref).then(apply);
    };
    run();
    const off = onFilesMapChange(run);
    return () => {
      cancelled = true;
      off();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [ref]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/70" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[92vh] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col items-center focus:outline-none"
        >
          <Dialog.Title className="sr-only">
            {t("cards.photo.lightboxLabel")}
          </Dialog.Title>
          {res.state === "ready" && res.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={res.url}
              alt={card.content || t("cards.photo.lightboxLabel")}
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          ) : (
            <div className="rounded-md bg-bg px-4 py-3 text-sm text-text-soft">
              {res.state === "missing"
                ? t("cards.photo.missing")
                : t("cards.photo.pending")}
            </div>
          )}
          {card.content && (
            <p className="mt-2 max-w-[90vw] truncate text-center text-sm text-white">
              {card.content}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
