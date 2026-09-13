/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n6 — 캔버스 붙여넣기·드롭 → 블록 든 메모.
 *
 * 이미지·파일 blob을 OPFS에 저장하고 state/blocks.ts(n2)의 serializeBlock으로
 * 블록 마크다운 한 줄을 만드는 순수+저장 헬퍼. Canvas.tsx의 onPaste/onDrop이
 * 이 모듈만 통해 OPFS·블록 문법에 닿는다 — imagePaste.ts(n4/n5 소유)는 건드리지
 * 않고 같은 제한(용량·형식)만 독립적으로 반영한다(spec §4 경계 조건).
 * ───────────────────────────────────────────────────────────── */

import { makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { serializeBlock } from "@/state/blocks";
import { useToasts } from "@/state/notifications";

/** [[FEAT-memo-image-paste]]와 동일 한도(spec §4). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 파일·녹음 블록 한도(spec §4 경계 조건). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** 한 번에 떨어뜨릴 수 있는 파일 개수(spec §4 경계 조건). */
export const MAX_DROP_FILES = 20;
/** 여러 파일을 놓았을 때 메모끼리 겹치지 않게 비켜 쌓는 간격(px, spec §4). */
export const DROP_STACK_OFFSET_PX = 24;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function warn(title: string): void {
  useToasts.getState().push({ tone: "warn", title });
}

/** 클립보드 이벤트에서 image MIME 파일을 모은다. files 우선, 없으면 items. */
export function extractImageFilesFromClipboard(event: ClipboardEvent): File[] {
  const transfer = event.clipboardData;
  if (!transfer) return [];
  const out: File[] = [];
  if (transfer.files && transfer.files.length > 0) {
    for (const file of Array.from(transfer.files)) {
      if (file.type.startsWith("image/")) out.push(file);
    }
  }
  if (out.length === 0 && transfer.items) {
    for (const item of Array.from(transfer.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) out.push(file);
      }
    }
  }
  return out;
}

/** 드롭 이벤트에서 파일 전체를 모은다(형식 무관 — image/그 외 분기는 호출부). */
export function extractFilesFromDrop(event: DragEvent): File[] {
  const transfer = event.dataTransfer;
  if (!transfer?.files) return [];
  return Array.from(transfer.files);
}

/**
 * 이미지 파일을 OPFS에 저장하고 이미지 블록 마크다운(`![](opfs://…)`)을 반환한다.
 * 형식·용량이 거부되면 토스트를 띄우고 null.
 */
export async function storeImageBlock(file: File): Promise<string | null> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    warn(`지원하지 않는 이미지 형식이에요: ${file.type || "알 수 없음"}`);
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    warn(`이미지가 너무 커요 (최대 ${mb}MB).`);
    return null;
  }
  try {
    const storageRef = await putBlob(makeAttachmentFilename(file.type), file);
    return serializeBlock({ type: "image", ref: storageRef });
  } catch (err) {
    console.warn("canvasCapture: 이미지 저장 실패", err);
    warn("이미지를 저장하지 못했어요.");
    return null;
  }
}

/**
 * 파일을 OPFS에 저장하고 파일 블록 마크다운(`[filename](opfs://… "moss-file")`)을 반환한다.
 * 용량 초과면 토스트를 띄우고 null.
 */
export async function storeFileBlock(file: File): Promise<string | null> {
  if (file.size > MAX_FILE_BYTES) {
    const mb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
    warn(`파일이 너무 커요 (최대 ${mb}MB).`);
    return null;
  }
  try {
    const storageRef = await putBlob(
      makeAttachmentFilename(file.type || undefined),
      file,
    );
    return serializeBlock({
      type: "file",
      ref: storageRef,
      filename: file.name || "파일",
    });
  } catch (err) {
    console.warn("canvasCapture: 파일 저장 실패", err);
    warn("파일을 저장하지 못했어요.");
    return null;
  }
}

/** 20개 초과 드롭 시 토스트. */
export function warnDropLimitExceeded(droppedCount: number): void {
  useToasts.getState().push({
    tone: "warn",
    title: `한 번에 놓을 수 있는 파일은 ${MAX_DROP_FILES}개까지예요.`,
    body: `${droppedCount - MAX_DROP_FILES}개는 건너뛰었어요.`,
  });
}
