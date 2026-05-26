"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/state/workspace";
import { makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { serializeLink } from "@/state/cardContent";

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

interface Options {
  /** 이미 사용자가 컨텐츠/첨부를 가지고 있으면 덮어쓰지 않는다 (AC-3). */
  skipIfPresent: boolean;
}

/**
 * 카드 mount 시 1회 시도 — clipboard에 image/URL이 있으면 자동 채움.
 * 권한 거부·미지원은 조용히 무시.
 *
 * FEAT-capture AC-5.
 */
export function useClipboardWatch(
  kind: "image" | "link",
  cardId: string,
  options: Options = { skipIfPresent: true },
): void {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    // 카드 현재 상태 (가져오는 시점에 동기)
    const card = useWorkspace.getState().cards.find((c) => c.id === cardId);
    if (!card) return;
    if (options.skipIfPresent) {
      if (kind === "image" && (card.content || card.attachmentRef)) return;
      if (kind === "link" && card.content) return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard) return;

    if (kind === "image") {
      void tryClipboardImage(cardId);
    } else {
      void tryClipboardLink(cardId);
    }
  }, [kind, cardId, options.skipIfPresent]);
}

async function tryClipboardImage(cardId: string): Promise<void> {
  const clipboard = navigator.clipboard as
    | (Clipboard & { read?: () => Promise<ClipboardItem[]> })
    | undefined;
  if (!clipboard?.read) return;
  let items: ClipboardItem[] = [];
  try {
    items = await clipboard.read();
  } catch {
    return;
  }
  for (const item of items) {
    const imgType = item.types.find((t) => t.startsWith("image/"));
    if (!imgType) continue;
    try {
      const blob = await item.getType(imgType);
      const filename = makeAttachmentFilename(blob.type);
      const ref = await putBlob(filename, blob);
      useWorkspace.getState().setAttachment(cardId, ref, {
        content: "clipboard",
        mediaType: blob.type,
      });
      return;
    } catch {
      /* 다음 item 시도 */
    }
  }
}

async function tryClipboardLink(cardId: string): Promise<void> {
  const clipboard = navigator.clipboard as
    | (Clipboard & { readText?: () => Promise<string> })
    | undefined;
  if (!clipboard?.readText) return;
  let text = "";
  try {
    text = await clipboard.readText();
  } catch {
    return;
  }
  const trimmed = text.trim();
  if (!URL_PATTERN.test(trimmed)) return;

  // 더 이상 빈 상태가 아니면 덮어쓰지 않는다 (사용자가 그 사이 직접 입력)
  const card = useWorkspace.getState().cards.find((c) => c.id === cardId);
  if (!card || card.content) return;
  useWorkspace.getState().setContent(cardId, serializeLink({ url: trimmed }));
}
