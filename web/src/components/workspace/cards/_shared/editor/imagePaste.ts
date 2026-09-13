/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-image-paste (W2) — 메모 이미지 붙여넣기·드롭 → OPFS.
 *
 * 두 개의 seam에 한 줄씩 붙는다([[_squad-memo-production]] §조율점):
 *  ① pasteHandlers[]  ← imagePasteHandler  — 클립보드/드롭 image blob을 OPFS에
 *     저장하고 본문에 `![](opfs://<id>)` 인라인 이미지를 삽입한다.
 *     (sanitize=먼저, image=나중. 텍스트만이면 false 반환 → 기본 붙여넣기로 통과)
 *  ② editorPlugins[]  ← opfsImagePlugin    — `opfs://` src를 가진 image 노드를
 *     blob URL로 렌더하는 NodeView. 카드·모달·재로딩 후에도 동작(AC-4).
 *
 * 본문(마크다운)에는 OPFS 참조(`opfs://<id>`)만 남고 실제 바이트는 OPFS에 있다
 * (마크다운 호환·export 친화, 스펙 §5). 렌더 시에만 blob URL로 해석하며
 * NodeView가 자기 object URL을 destroy에서 revoke해 누수를 막는다(스펙 §8).
 *
 * OPFS 어댑터(state/db/opfs)는 `opfs:<filename>` (콜론 1개) 참조를 쓰고,
 * 마크다운 호환 URL 스킴은 `opfs://<filename>` (콜론+슬래시 2개)다 — 둘 사이를
 * toStorageRef/toMarkdownUrl로 변환한다.
 * ───────────────────────────────────────────────────────────── */

import { $prose } from "@milkdown/utils";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { Plugin, TextSelection } from "@milkdown/prose/state";
import type { EditorView, NodeView } from "@milkdown/prose/view";

import { getBlobUrl, makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { useToasts } from "@/state/notifications";

import type { PasteHandler } from "./extensions";

/** 마크다운 본문에 들어가는 URL 스킴(콜론+슬래시 2개). */
const OPFS_URL_PREFIX = "opfs://";
/** OPFS 어댑터(state/db/opfs)의 참조 스킴(콜론 1개). */
const OPFS_STORAGE_PREFIX = "opfs:";

/** 초과 시 토스트 경고 후 무시(AC-5). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/** 인라인 삽입을 허용하는 이미지 타입. 그 외는 경고 후 무시(AC-5). */
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

/* ── 참조 스킴 변환 ─────────────────────────────────────────── */

/**
 * `opfs://abc.png` → `opfs:abc.png` (어댑터 참조).
 * FEAT-sticky-redesign n2: state/blocks.ts가 링크·녹음·파일 블록의 OPFS 참조
 * 변환에도 재사용한다(복제 금지).
 */
export function toStorageRef(markdownUrl: string): string {
  return OPFS_STORAGE_PREFIX + markdownUrl.slice(OPFS_URL_PREFIX.length);
}

/** `opfs:abc.png` → `opfs://abc.png` (마크다운 URL). state/blocks.ts 재사용. */
export function toMarkdownUrl(storageRef: string): string {
  return OPFS_URL_PREFIX + storageRef.slice(OPFS_STORAGE_PREFIX.length);
}

/**
 * 마크다운 본문의 `opfs://<id>` 참조를 화면에 그릴 수 있는 blob URL로 해석한다.
 * 해석 불가(미저장·OPFS 미지원)면 원본 ref를 그대로 반환한다.
 * 반환된 blob URL은 호출자가 revokeObjectURL로 해제할 책임을 진다(스펙 §8).
 */
export async function resolveOpfsImageSrc(ref: string): Promise<string> {
  if (!ref.startsWith(OPFS_URL_PREFIX)) return ref;
  const url = await getBlobUrl(toStorageRef(ref));
  return url ?? ref;
}

/* ── 이벤트에서 이미지 파일 추출 ─────────────────────────────── */

function getTransfer(
  event: ClipboardEvent | DragEvent,
): DataTransfer | null {
  if ("clipboardData" in event && event.clipboardData) {
    return event.clipboardData;
  }
  if ("dataTransfer" in event && event.dataTransfer) {
    return event.dataTransfer;
  }
  return null;
}

function isDragEvent(event: ClipboardEvent | DragEvent): event is DragEvent {
  return "dataTransfer" in event;
}

/** 클립보드/드롭에서 image MIME 파일을 모은다. files 우선, 없으면 items. */
function extractImageFiles(event: ClipboardEvent | DragEvent): File[] {
  const transfer = getTransfer(event);
  if (!transfer) return [];

  const out: File[] = [];
  if (transfer.files && transfer.files.length > 0) {
    for (const file of Array.from(transfer.files)) {
      if (file.type.startsWith("image/")) out.push(file);
    }
  }
  // 일부 브라우저는 클립보드 이미지를 files가 아닌 items로만 노출한다.
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

/* ── 토스트 ──────────────────────────────────────────────────── */

function warn(title: string): void {
  // 컴포넌트 밖(ProseMirror 핸들러)이라 store에 직접 push.
  useToasts.getState().push({ tone: "warn", title });
}

/** 거부 사유(있으면 문자열, 통과면 null). */
function rejectReason(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return `지원하지 않는 이미지 형식이에요: ${file.type || "알 수 없음"}`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    return `이미지가 너무 커요 (최대 ${mb}MB).`;
  }
  return null;
}

/* ── 삽입 ────────────────────────────────────────────────────── */

/**
 * 이미지들을 OPFS에 저장하고 pos부터 차례로 image 노드를 삽입한다.
 * 비동기(OPFS write)라 handlePaste의 동기 반환 이후 별도로 진행된다.
 */
async function insertImages(
  view: EditorView,
  files: File[],
  startPos: number,
): Promise<void> {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return;

  let pos = startPos;
  for (const file of files) {
    const reason = rejectReason(file);
    if (reason) {
      warn(reason);
      continue;
    }

    let storageRef: string;
    try {
      storageRef = await putBlob(makeAttachmentFilename(file.type), file);
    } catch (err) {
      console.warn("imagePaste: OPFS 저장 실패", err);
      warn("이미지를 저장하지 못했어요.");
      continue;
    }

    const { state } = view;
    const node = imageType.create({
      src: toMarkdownUrl(storageRef),
      alt: file.name || "",
    });
    const clamped = Math.min(Math.max(pos, 0), state.doc.content.size);
    const selection = TextSelection.near(state.doc.resolve(clamped));
    const tr = state.tr.setSelection(selection).replaceSelectionWith(node, false);
    view.dispatch(tr);
    // 다음 이미지는 방금 삽입한 노드 뒤에서 이어붙인다.
    pos = view.state.selection.from;
  }
}

/* ── ① paste/drop 핸들러 (pasteHandlers[]에 등록) ──────────────
 * image blob이 있으면 소비(true)하고 비동기로 삽입한다.
 * 이미지가 전혀 없으면 false → 기본 붙여넣기/정제(W6)로 통과한다(AC-3). */
export const imagePasteHandler: PasteHandler = (view, event) => {
  const files = extractImageFiles(event);
  if (files.length === 0) return false;

  let pos = view.state.selection.from;
  if (isDragEvent(event)) {
    event.preventDefault();
    const coords = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (coords) pos = coords.pos;
  }

  void insertImages(view, files, pos);
  return true;
};

/* ── ② opfs:// 이미지 NodeView (editorPlugins[]에 등록) ─────────
 * image 노드의 src가 opfs://면 blob URL로 해석해 그린다. 노드 attr(마크다운
 * 직렬화)은 opfs:// 그대로 유지되고, 화면에만 blob URL을 쓴다. atom 노드라
 * contentDOM이 없고, ignoreMutation으로 src 교체가 PM 재렌더 루프를 타지 않게 한다. */
class OpfsImageNodeView implements NodeView {
  dom: HTMLImageElement;
  private currentSrc = "";
  private objectUrl: string | null = null;
  private destroyed = false;

  constructor(node: ProseNode) {
    this.dom = document.createElement("img");
    this.dom.setAttribute("draggable", "false");
    this.render(node);
  }

  private releaseUrl(): void {
    if (this.objectUrl) {
      try {
        URL.revokeObjectURL(this.objectUrl);
      } catch {
        /* noop — 이미 해제됨 */
      }
      this.objectUrl = null;
    }
  }

  private render(node: ProseNode): void {
    const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
    this.dom.alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
    const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
    if (title) this.dom.title = title;
    else this.dom.removeAttribute("title");

    if (src === this.currentSrc) return;
    this.currentSrc = src;
    this.releaseUrl();

    if (src.startsWith(OPFS_URL_PREFIX)) {
      // 해석 전까지는 src 미지정(placeholder). data 속성은 디버그·테스트용.
      this.dom.removeAttribute("src");
      this.dom.setAttribute("data-opfs-src", src);
      void resolveOpfsImageSrc(src).then((url) => {
        // 해석 도중 노드가 바뀌거나 파괴됐으면 새 URL을 즉시 회수.
        if (this.destroyed || this.currentSrc !== src) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        if (url.startsWith("blob:")) this.objectUrl = url;
        this.dom.src = url;
      });
    } else {
      this.dom.removeAttribute("data-opfs-src");
      this.dom.src = src;
    }
  }

  update(node: ProseNode): boolean {
    if (node.type.name !== "image") return false;
    this.render(node);
    return true;
  }

  // atom 이미지의 src 교체는 사용자 편집이 아니므로 PM이 무시하게 한다.
  ignoreMutation(): boolean {
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode");
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode");
  }

  destroy(): void {
    this.destroyed = true;
    this.releaseUrl();
  }
}

export const opfsImagePlugin = $prose(
  () =>
    new Plugin({
      props: {
        nodeViews: {
          image: (node) => new OpfsImageNodeView(node),
        },
      },
    }),
);
