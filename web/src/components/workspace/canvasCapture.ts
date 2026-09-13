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
// FEAT-sticky-redesign 2단계 리뷰 P1-6 — 한도·지원 형식은 attachmentLimits.ts가 유일한
// 출처(imagePaste.ts·BlockMenu.tsx와 공유). MAX_ATTACHMENT_BYTES는 기존 이름을 유지한 채
// MAX_ATTACHMENT_BYTES를 재노출한다(호출부 하위 호환).
import {
  MAX_ATTACHMENT_BYTES,
  MAX_DROP_FILES,
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_TYPES,
} from "@/state/attachmentLimits";
import { t } from "@/i18n";

export { MAX_IMAGE_BYTES, MAX_DROP_FILES };
/** 여러 파일을 놓았을 때 메모끼리 겹치지 않게 비켜 쌓는 간격(px, spec §4). */
export const DROP_STACK_OFFSET_PX = 24;

function warn(title: string, body?: string): void {
  useToasts.getState().push({ tone: "warn", title, body });
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
    warn(t("capture.canvas.imageUnsupported", { type: file.type || t("capture.canvas.unknownType") }));
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    warn(t("capture.canvas.imageTooBig", { mb }));
    return null;
  }
  try {
    const storageRef = await putBlob(makeAttachmentFilename(file.type), file);
    return serializeBlock({ type: "image", ref: storageRef });
  } catch (err) {
    console.warn("canvasCapture: 이미지 저장 실패", err);
    warn(t("capture.canvas.saveImageFailed"));
    return null;
  }
}

/**
 * 파일을 OPFS에 저장하고 파일 블록 마크다운(`[filename](opfs://… "moss-file")`)을 반환한다.
 * 용량 초과면 토스트를 띄우고 null.
 */
export async function storeFileBlock(file: File): Promise<string | null> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    warn(t("capture.canvas.fileTooBig", { mb }));
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
      filename: file.name || t("capture.canvas.unnamedFile"),
    });
  } catch (err) {
    console.warn("canvasCapture: 파일 저장 실패", err);
    warn(t("capture.canvas.saveFileFailed"));
    return null;
  }
}

/** 20개 초과 드롭 시 토스트. */
export function warnDropLimitExceeded(droppedCount: number): void {
  warn(
    t("capture.canvas.dropLimitTitle", { max: MAX_DROP_FILES }),
    t("capture.canvas.dropLimitBody", { count: droppedCount - MAX_DROP_FILES }),
  );
}
