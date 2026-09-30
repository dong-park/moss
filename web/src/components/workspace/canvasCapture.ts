/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n6 — 캔버스 붙여넣기·드롭 → 블록 든 메모.
 *
 * 이미지·파일 blob을 OPFS에 저장하고 state/blocks.ts(n2)의 serializeBlock으로
 * 블록 마크다운 한 줄을 만드는 순수+저장 헬퍼. Canvas.tsx의 onPaste/onDrop이
 * 이 모듈만 통해 OPFS·블록 문법에 닿는다 — imagePaste.ts(n4/n5 소유)는 건드리지
 * 않고 같은 제한(용량·형식)만 독립적으로 반영한다(spec §4 경계 조건).
 * ───────────────────────────────────────────────────────────── */

import { makeAttachmentFilename } from "@/state/db/opfs";
import { serializeBlock } from "@/state/blocks";
import { useToasts } from "@/state/notifications";
import { storeAttachment } from "@/state/share/attachments";
import { useWorkspace } from "@/state/workspace";
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

/** FEAT-photo-card: storePhoto 결과 — addPhotoAt이 그대로 받는다. */
export interface StoredPhoto {
  ref: string;
  mediaType: string;
  /** 원본 픽셀 크기. 0이면 못 읽음 → 호출부(addPhotoAt)가 정사각형으로 만든다. */
  naturalW: number;
  naturalH: number;
}

/**
 * 이미지 원본 크기를 읽는다. `createImageBitmap`이 1순위(webp·gif·png 등),
 * 지원 안 되는 svg 등은 `<img>` naturalWidth, 그것도 0이면 {0,0}을 돌려준다
 * — 호출부가 정사각형으로 만든다(spec 경계 조건).
 */
async function readNaturalSize(file: File): Promise<{ w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { w: bitmap.width, h: bitmap.height };
      bitmap.close?.();
      if (size.w > 0 && size.h > 0) return size;
    } catch {
      /* svg 등 일부 브라우저 미지원 — 아래 <img> 폴백 */
    }
  }
  // 크기 없는 svg 등 createImageBitmap이 실패한 경우만 <img>로 naturalWidth를 읽는다.
  // 그 외(jsdom처럼 createImageBitmap 자체가 없는 환경)는 여기서 포기 — Image 로드가
  // 일어나지 않으면 onload도 onerror도 오지 않아 매달린다. 타임아웃으로도 방어한다.
  if (file.type === "image/svg+xml" && typeof Image !== "undefined" && typeof URL !== "undefined") {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(file);
      const size = await new Promise<{ w: number; h: number } | null>((resolve) => {
        const img = new Image();
        const done = (v: { w: number; h: number } | null) => resolve(v);
        const timer = setTimeout(() => done(null), 1000);
        img.onload = () => {
          clearTimeout(timer);
          done({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
          clearTimeout(timer);
          done(null);
        };
        img.src = url!;
      });
      if (size && size.w > 0 && size.h > 0) return size;
    } catch {
      /* 크기 못 읽음 — {0,0} */
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  return { w: 0, h: 0 };
}

/** 이미지 형식·용량 검사. 거부하면 토스트를 띄우고 false — 사진 카드와 이미지 블록이 같은 한도를 쓴다. */
function acceptImage(file: File): boolean {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    warn(t("capture.canvas.imageUnsupported", { type: file.type || t("capture.canvas.unknownType") }));
    return false;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    warn(t("capture.canvas.imageTooBig", { mb }));
    return false;
  }
  return true;
}

/**
 * FEAT-photo-card: 이미지 파일을 OPFS에 저장하고 사진 카드 생성에 필요한 정보를
 * 돌려준다. 형식·용량이 거부되면 토스트 후 null(storeImageBlock과 같은 한도).
 * 캡션은 여기서 만들지 않는다 — 카드는 빈 캡션(그냥 사진)으로 시작한다.
 */
export async function storePhoto(file: File): Promise<StoredPhoto | null> {
  if (!acceptImage(file)) return null;
  try {
    const ref = await storeAttachment(
      useWorkspace.getState().currentBoardId,
      makeAttachmentFilename(file.type),
      file,
    );
    const { w, h } = await readNaturalSize(file);
    return { ref, mediaType: file.type, naturalW: w, naturalH: h };
  } catch (err) {
    console.warn("canvasCapture: 사진 저장 실패", err);
    warn(t("capture.canvas.saveImageFailed"));
    return null;
  }
}

/**
 * 이미지 파일을 OPFS에 저장하고 이미지 블록 마크다운(`![](opfs://…)`)을 반환한다.
 * 형식·용량이 거부되면 토스트를 띄우고 null.
 */
export async function storeImageBlock(file: File): Promise<string | null> {
  if (!acceptImage(file)) return null;
  try {
    const storageRef = await storeAttachment(
      useWorkspace.getState().currentBoardId,
      makeAttachmentFilename(file.type),
      file,
    );
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
    const storageRef = await storeAttachment(
      useWorkspace.getState().currentBoardId,
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
