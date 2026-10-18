"use client";

/**
 * FEAT-collab-auth n10 (작업 3·4) — 공유 보드 첨부 업로드·다운로드 캐시.
 *
 * 혼자 쓰는 보드: 지금처럼 OPFS에만 둔다(네트워크 0건, AC-1).
 * 공유 보드:
 *  - 첨부를 만들면 OPFS에 먼저 넣고(로컬 이름 참조를 블록에 즉시 쓴다), 업로드를
 *    백그라운드로 돌린다. 성공하면 Y.Doc `files` 맵에 `opfs:<file>` → fileId를 적는다.
 *  - 다른 참여자는 맵에 fileId가 생기면 서버에서 내려받아 같은 로컬 이름으로 OPFS에
 *    캐시한다. 맵에 아직 없으면(업로드 전이거나 실패) '올리는 중' 자리표시자다.
 *
 * n10w 리뷰 반영:
 *  - P1-2: 수신 자동 다운로드에 보드별 예산을 둔다(대량 자동 다운로드로 인한
 *    대역폭·쿼터 소진 방지). 사용자 트리거(force)는 예산을 쓰지 않는다.
 *  - P1-4/A: 공유를 시작할 때 그 보드에 이미 있던 로컬 첨부를 소급 업로드한다.
 *  - P1-5: 내려받을 fileId가 이미 동기화됐으면 collab/소유 상태와 무관하게 내려받는다.
 *  - P2-1: 다운로드 캐시는 보드별 네임스페이스로 분리한다(참조 충돌 방지).
 *  - B: `files` 맵 변화를 구독해 열려 있는 화면이 자리표시자를 실제 첨부로 바꾸게 한다.
 *
 * remote-mcp n1: 저장 용량 상한(413 quota_exceeded)에 막힌 업로드는 `files` 맵의 실패 키
 * (uploadFailedKey)에 UPLOAD_FAILED_QUOTA를 적는다. 다른 기기는 '올리는 중' 대신 '올리지 못함'을
 * 보고, 업로더 기기는 안내를 받는다. 다음 백필이 다시 시도한다. 실패 표시는 참조 키와 따로 있어
 * 다른 기기의 성공(fileId)을 덮지 못하고, 읽을 때는 fileId가 실패 표시보다 앞선다.
 * 크기 초과(413 too_large 등)는 업로더에게만 알리고 맵에 쓰지 않는다.
 */
import type * as Y from "yjs";
import { t } from "@/i18n";
import { AuthRequestError, useAuth } from "@/state/auth";
import { getBlob, getBlobUrl, putBlob } from "@/state/db/opfs";
import { useToasts } from "@/state/notifications";
import { getActiveBoardDoc, getOrOpenBoardDoc } from "@/state/ydoc/activeDoc";
import { filesMap, readDocFile, readNotes, setDocFile } from "@/state/ydoc/model";
import { transactLocal } from "@/state/ydoc/origin";
import { writeToBoardDoc } from "@/state/ydoc/writeThrough";
import { useCollab } from "@/state/collab";
import { useShare } from "./store";
import { realFilesApi, type FilesApi } from "./files";

export interface AttachmentDeps {
  files: FilesApi;
  /** P1-2: 보드별 자동(렌더) 다운로드 예산. 없으면 기본값. */
  maxAutoDownloadsPerBoard?: number;
  /** 업로더에게 띄우는 안내. 테스트는 토스트 대신 기록한다. */
  notify: (message: string) => void;
}

const DEFAULT_MAX_AUTO_DOWNLOADS = 64;

const defaultDeps: AttachmentDeps = {
  files: realFilesApi,
  notify: (message) => {
    useToasts.getState().push({ tone: "calm", title: message });
  },
};
let deps: AttachmentDeps = defaultDeps;

/** 테스트 주입용 — n8 `configureShare`와 같은 패턴. */
export function configureAttachments(next: Partial<AttachmentDeps>): void {
  deps = { ...deps, ...next };
}

export function resetAttachmentDeps(): void {
  deps = defaultDeps;
}

const OPFS_PREFIX = "opfs:";

/**
 * 저장 용량 상한에 막혀 서버에 올리지 못한 첨부의 실패 표시 값. `files` 맵의
 * `uploadFailedKey(ref)` 키에만 쓴다 — 참조 키(`opfs:<file>`)의 값은 언제나 fileId다.
 */
export const UPLOAD_FAILED_QUOTA = "!quota_exceeded";

/**
 * `files` 맵의 실패 표시 키. `!`로 시작해 첨부 참조와 겹치지 않는다. 맵을 훑는 쪽(MCP 도구)은
 * `!`로 시작하는 키를 첨부로 읽으면 안 된다.
 */
export function uploadFailedKey(localRef: string): string {
  return `!failed:${localRef}`;
}

/** 이 세션에서 안내를 띄운 보드·사유 — 붙여 넣은 첨부 여러 개가 안내를 여러 번 띄우지 않게. */
const uploadNotified = new Set<string>();

/** 이 보드가 서버에 공유돼 있는가. n7이 연결 중이거나 n8이 shared로 표시했으면 참. */
export function isSharedBoard(boardId: string | null | undefined): boolean {
  if (!boardId) return false;
  if (useCollab.getState().boardId === boardId) return true;
  return useShare.getState().byBoard[boardId]?.status === "shared";
}

/* ── 보드별 OPFS 네임스페이스 (P2-1) ───────────────────────────── */

function sanitizeBoardId(boardId: string): string {
  // OPFS filename은 단일 세그먼트만 허용 — 구분자/특수문자를 접는다.
  return boardId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * 다운로드 캐시가 저장되는 OPFS 참조. 전역 `opfs:<file>` 이름을 그대로 쓰면 서로
 * 다른 보드의 같은 이름 참조가 충돌하므로 보드 접두를 붙인다(업로더의 로컬 blob은
 * 여전히 전역 이름이고 조회는 스코프 → 전역 순서로 폴백한다).
 */
export function attachmentCacheRef(boardId: string, ref: string): string {
  if (!ref.startsWith(OPFS_PREFIX)) return ref;
  return `${OPFS_PREFIX}${sanitizeBoardId(boardId)}__${ref.slice(OPFS_PREFIX.length)}`;
}

/** 진행 중인 업로드/다운로드를 ref 단위로 합친다 — 같은 첨부를 두 번 올리거나 받지 않게. */
const inflight = new Map<string, Promise<void>>();

/** P1-2: 보드별로 이미 시작한 자동 다운로드 수. */
const autoDownloads = new Map<string, number>();

/**
 * 첨부 blob을 OPFS에 두고 저장 참조(`opfs:<file>`)를 돌려준다.
 * 공유 보드면 업로드를 백그라운드로 시작한다 — 참조는 업로드를 기다리지 않는다.
 */
export async function storeAttachment(
  boardId: string | null,
  filename: string,
  blob: Blob,
): Promise<string> {
  const ref = await putBlob(filename, blob);
  if (boardId && isSharedBoard(boardId)) {
    void uploadAttachment(boardId, ref, blob, filename);
  }
  return ref;
}

/**
 * 블록 참조를 서버에 올리고 성공하면 Y.Doc `files` 맵에 fileId를 적는다.
 * 실패하면 아무것도 쓰지 않는다 — 다른 참여자에게는 '올리는 중' 자리표시자가 남는다.
 */
export async function uploadAttachment(
  boardId: string,
  localRef: string,
  blob: Blob,
  filename: string,
): Promise<void> {
  const key = `up:${boardId}:${localRef}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      const session = await useAuth.getState().ensureSession();
      const saved = await deps.files.upload(boardId, blob, filename, session.accessToken);
      await writeToBoardDoc(boardId, (doc) =>
        transactLocal(doc, () => {
          setDocFile(doc, localRef, saved.id);
          filesMap(doc).delete(uploadFailedKey(localRef));
        }),
      );
    } catch (err) {
      if (err instanceof AuthRequestError && err.status === 413) {
        // 계정 상한만 공유 문서에 실패로 남긴다. 파일·보드 크기 초과는 업로더에게만 알린다.
        if (err.code === "quota_exceeded") await markQuotaFailed(boardId, localRef);
        else notifyTooLarge(boardId, err.code === "too_large" ? err.message : "");
        return;
      }
      // 업로드 실패 — 매핑을 쓰지 않는다(자리표시자 유지). 사용자 편집은 잃지 않는다.
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/** 용량 초과: 다른 기기가 '올리지 못함'을 보게 맵에 표시하고, 업로더에게 한 번 알린다. */
async function markQuotaFailed(boardId: string, localRef: string): Promise<void> {
  notifyOnce(`quota:${boardId}`, t("collab.attachment.quotaFailed"));
  await writeToBoardDoc(boardId, (doc) => {
    if (readDocFile(doc, localRef)) return;
    transactLocal(doc, () => filesMap(doc).set(uploadFailedKey(localRef), UPLOAD_FAILED_QUOTA));
  }).catch(() => {
    /* 문서를 못 열면 표시만 빠진다 — 다른 기기는 '올리는 중'을 본다 */
  });
}

/** 파일 20MB·보드 500MB 초과(또는 프록시가 code 없이 낸 413). 서버 사유가 없으면 기본 문구. */
function notifyTooLarge(boardId: string, reason: string): void {
  const why = reason.replace(/[.。]\s*$/, "") || t("collab.attachment.tooLargeReason");
  notifyOnce(`large:${boardId}`, t("collab.attachment.tooLarge", { reason: why }));
}

function notifyOnce(key: string, message: string): void {
  if (uploadNotified.has(key)) return;
  uploadNotified.add(key);
  deps.notify(message);
}

/** 실패 표시가 있는가. 읽는 쪽은 fileId를 먼저 본다 — 성공이 실패 표시를 이긴다. */
function hasUploadFailure(doc: Y.Doc, localRef: string): boolean {
  return filesMap(doc).get(uploadFailedKey(localRef)) === UPLOAD_FAILED_QUOTA;
}

/**
 * FEAT-collab-auth n10w P1-4/A — 공유 시작 시 보드에 이미 있는 로컬 첨부를 소급
 * 업로드한다. 파일명 규약: 본문의 `opfs://<file>`을 스캔해 files 맵에 아직 없는
 * 것만 `uploadAttachment`로 올린다. 실패분은 맵에 안 남아 다음 공유 세션에 재시도된다.
 */
const ATTACHMENT_MD_RE = /opfs:\/\/([^\s)"']+)/g;

/**
 * 보드 문서에서 올려야 할 로컬 첨부 참조 목록. 두 곳을 본다:
 *  - 본문 마크다운의 `opfs://<file>`(이미지 블록 등)
 *  - `note.attachmentRef`(FEAT-photo-card 사진 카드 — content에 마크다운이 없다)
 * 사진은 content가 캡션 평문이라 본문 스캔만으로는 나중에 공유로 바꾼 보드의
 * 사진이 올라가지 않는다(성공 기준 13).
 */
export function collectLocalRefs(doc: Y.Doc): string[] {
  const refs = new Set<string>();
  for (const note of readNotes(doc)) {
    if (typeof note.attachmentRef === "string" && note.attachmentRef.startsWith(OPFS_PREFIX)) {
      refs.add(note.attachmentRef);
    }
    const content = typeof note.content === "string" ? note.content : "";
    for (const m of content.matchAll(ATTACHMENT_MD_RE)) {
      refs.add(`${OPFS_PREFIX}${m[1]}`);
    }
  }
  return [...refs];
}

export async function backfillBoardAttachments(boardId: string): Promise<void> {
  const handle = getOrOpenBoardDoc(boardId);
  try {
    await handle.whenLoaded;
  } catch {
    return; // 못 연 보드 — 다음 공유 세션에 재시도.
  }
  for (const ref of collectLocalRefs(handle.doc)) {
    const fileId = readDocFile(handle.doc, ref);
    if (fileId) continue; // 이미 올라감. 용량 초과로 못 올린 것(실패 키)은 다시 시도한다.
    const blob = await getBlob(ref).catch(() => null);
    if (!blob) continue; // 이 기기에 없는 참조는 올릴 것이 없다.
    await uploadAttachment(boardId, ref, blob, ref.slice(OPFS_PREFIX.length));
  }
}

/* ── files 맵 observer (B) ────────────────────────────────────── */

let observerDoc: Y.Doc | null = null;
let observerHandler: (() => void) | null = null;
const filesListeners = new Set<() => void>();

/**
 * 활성 보드의 `files` 맵 변화를 구독한다. fileId가 새로 동기화되면 열려 있는
 * 위젯/노드뷰가 자리표시자를 실제 첨부로 바꿀 수 있게 한다.
 */
export function onFilesMapChange(cb: () => void): () => void {
  filesListeners.add(cb);
  syncFilesObserver();
  return () => {
    filesListeners.delete(cb);
  };
}

function syncFilesObserver(): void {
  const doc = getActiveBoardDoc()?.doc ?? null;
  if (observerDoc === doc) return;
  detachFilesObserver();
  if (doc) {
    const handler = () => {
      for (const cb of filesListeners) cb();
    };
    filesMap(doc).observe(handler);
    observerDoc = doc;
    observerHandler = handler;
  }
}

function detachFilesObserver(): void {
  if (observerDoc && observerHandler) {
    filesMap(observerDoc).unobserve(observerHandler);
  }
  observerDoc = null;
  observerHandler = null;
}

/* ── 해석 ─────────────────────────────────────────────────────── */

export type AttachmentState = "ready" | "pending" | "failed" | "missing";

export type AttachmentResolution =
  /** OPFS에서 꺼내 쓸 수 있다(또는 방금 내려받아 캐시했다). */
  | { state: "ready"; url: string }
  /** 공유 보드인데 아직 못 쓴다 — 업로드 전·진행 중·실패. '올리는 중' 자리표시자. */
  | { state: "pending"; url: null }
  /** 업로더가 저장 용량 상한에 막혀 서버에 올리지 못했다. '올리지 못함' 자리표시자. */
  | { state: "failed"; url: null }
  /** 이 기기에 없고 공유 보드도 아니다 — 복구 불가. */
  | { state: "missing"; url: null };

async function hasLocalBlob(ref: string): Promise<boolean> {
  if (!ref.startsWith(OPFS_PREFIX)) return false;
  return (await getBlob(ref).catch(() => null)) !== null;
}

async function downloadToCache(boardId: string, ref: string, fileId: string): Promise<void> {
  const key = `down:${boardId}:${ref}`;
  let task = inflight.get(key);
  if (!task) {
    task = (async () => {
      try {
        const session = await useAuth.getState().ensureSession();
        const blob = await deps.files.download(boardId, fileId, session.accessToken);
        if (ref.startsWith(OPFS_PREFIX)) {
          await putBlob(attachmentCacheRef(boardId, ref).slice(OPFS_PREFIX.length), blob);
        }
      } catch {
        // 다운로드 실패 — 캐시하지 않는다. 다음 렌더가 다시 시도한다.
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, task);
  }
  await task;
}

/** P1-2: 자동 다운로드 예산이 남아 있는가. */
function autoBudgetAvailable(boardId: string): boolean {
  const limit = deps.maxAutoDownloadsPerBoard ?? DEFAULT_MAX_AUTO_DOWNLOADS;
  return (autoDownloads.get(boardId) ?? 0) < limit;
}

function noteAutoDownload(boardId: string): void {
  autoDownloads.set(boardId, (autoDownloads.get(boardId) ?? 0) + 1);
}

/**
 * 저장 참조를 상태로만 해석한다 — object URL을 만들지 않는다(P2-2: 자리표시자
 * 판정만 하는 호출자가 URL을 버려 누수되던 문제). 공유 보드에서 로컬에 없으면
 * 서버에서 내려받아 보드 스코프 이름으로 OPFS에 캐시한다.
 */
export async function resolveAttachmentState(
  ref: string,
  opts: { force?: boolean } = {},
): Promise<AttachmentState> {
  syncFilesObserver();
  const handle = getActiveBoardDoc();
  const boardId = handle?.boardId ?? null;

  if (!handle || !boardId) {
    return (await hasLocalBlob(ref)) ? "ready" : "missing";
  }

  // 1. 보드 스코프 캐시(P2-1) → 2. 업로더의 전역 로컬 이름.
  if (await hasLocalBlob(attachmentCacheRef(boardId, ref))) return "ready";
  if (await hasLocalBlob(ref)) return "ready";

  const fileId = readDocFile(handle.doc, ref);
  if (!fileId) {
    if (hasUploadFailure(handle.doc, ref)) return "failed";
    return isSharedBoard(boardId) ? "pending" : "missing";
  }

  // P1-5: fileId가 이미 동기화됐으면 collab 연결/소유 상태와 무관하게 내려받는다.
  // P1-2: 자동(렌더) 경로는 보드별 예산까지만 — 사용자 트리거(force)는 예산을 쓰지 않는다.
  if (!opts.force && !autoBudgetAvailable(boardId)) {
    return "pending";
  }

  await downloadToCache(boardId, ref, fileId);
  if (await hasLocalBlob(attachmentCacheRef(boardId, ref)) || (await hasLocalBlob(ref))) {
    if (!opts.force) noteAutoDownload(boardId);
    return "ready";
  }
  return "pending";
}

/**
 * 저장 참조를 화면에 그릴 blob URL로 해석한다. 공유 보드에서 로컬에 없으면
 * 서버에서 내려받아 같은 이름으로 OPFS에 캐시한 뒤 다시 해석한다.
 */
export async function resolveAttachment(
  ref: string,
  opts: { force?: boolean } = {},
): Promise<AttachmentResolution> {
  const state = await resolveAttachmentState(ref, opts);
  if (state !== "ready") return { state, url: null };

  const handle = getActiveBoardDoc();
  const boardId = handle?.boardId ?? null;
  let url: string | null = null;
  if (boardId) {
    url = await getBlobUrl(attachmentCacheRef(boardId, ref)).catch(() => null);
  }
  if (!url) url = await getBlobUrl(ref).catch(() => null);
  return url ? { state: "ready", url } : { state: "pending", url: null };
}

/** 테스트 격리용 — 진행 중 맵·예산·observer·deps를 비운다. */
export function resetAttachments(): void {
  inflight.clear();
  autoDownloads.clear();
  uploadNotified.clear();
  filesListeners.clear();
  detachFilesObserver();
  deps = defaultDeps;
}
