/**
 * OPFS 어댑터 — 큰 첨부(이미지·음성·파일)는 IndexedDB가 아니라
 * Origin Private File System에 보관한다.
 *
 * - 단일 파일 ≤ 500MB
 * - 전체 ≤ 5GB 권장
 * - 환경에 OPFS가 없을 경우 (서버 SSR·구브라우저) 함수들이 명확한 에러를 던진다.
 */

export interface QuotaInfo {
  usage: number;
  quota: number;
  pct: number;
}

const DIR_NAME = "moss-attachments";

/**
 * FEAT-sticky-redesign n3: v5 upgrade가 DB를 비운 뒤 OPFS 첨부도 한 번 비워야 한다.
 * upgrade 콜백 안에서는 비동기 OPFS 호출을 하지 않고(Dexie 트랜잭션 밖 작업 금지),
 * 대신 이 플래그를 localStorage에 남긴다. `storage.ts`의 `init()`이 DB open 성공 뒤
 * 플래그를 보고 실제 삭제를 실행하고, 성공했을 때만 플래그를 지운다 — 실패하면
 * 다음 실행에서 다시 시도한다.
 */
const OPFS_PURGE_PENDING_KEY = "moss:opfsPurgePending";

function safeLocalStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function markOpfsPurgePending(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(OPFS_PURGE_PENDING_KEY, "1");
  } catch {
    /* noop — 다음 세션에서도 플래그 못 남기면 첨부는 지연될 뿐 데이터 손상 아님 */
  }
}

export function isOpfsPurgePending(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(OPFS_PURGE_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearOpfsPurgePending(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(OPFS_PURGE_PENDING_KEY);
  } catch {
    /* noop */
  }
}

/** moss-attachments 디렉터리 전체 삭제(재귀). 없으면 no-op. */
export async function clearAttachmentsDir(): Promise<void> {
  const storage = getStorage();
  if (typeof storage.getDirectory !== "function") return;
  const root = await storage.getDirectory();
  try {
    await root.removeEntry(DIR_NAME, { recursive: true });
  } catch (err) {
    if ((err as DOMException)?.name === "NotFoundError") return;
    throw err;
  }
}

function getStorage(): StorageManager {
  if (typeof navigator === "undefined" || !navigator.storage) {
    throw new Error("OPFS unavailable: navigator.storage missing");
  }
  return navigator.storage;
}

export async function getDir(): Promise<FileSystemDirectoryHandle> {
  const storage = getStorage();
  if (typeof storage.getDirectory !== "function") {
    throw new Error("OPFS unavailable: navigator.storage.getDirectory missing");
  }
  const root = await storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

/**
 * filename은 단일 세그먼트만 허용 (디렉터리 분리 금지).
 * 반환값 = `opfs:<filename>` 형태의 reference. Note.attachmentRef에 보관.
 */
export async function putBlob(filename: string, blob: Blob): Promise<string> {
  if (!filename || filename.includes("/") || filename.includes("\\")) {
    throw new Error(`invalid OPFS filename: ${filename}`);
  }
  const dir = await getDir();
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return `opfs:${filename}`;
}

function parseRef(ref: string): string {
  if (!ref.startsWith("opfs:")) {
    throw new Error(`not an OPFS ref: ${ref}`);
  }
  return ref.slice("opfs:".length);
}

export async function getBlob(ref: string): Promise<Blob | null> {
  const filename = parseRef(ref);
  const dir = await getDir();
  try {
    const handle = await dir.getFileHandle(filename, { create: false });
    return await handle.getFile();
  } catch (err) {
    if ((err as DOMException)?.name === "NotFoundError") return null;
    throw err;
  }
}

export async function deleteBlob(ref: string): Promise<void> {
  const filename = parseRef(ref);
  const dir = await getDir();
  try {
    await dir.removeEntry(filename);
  } catch (err) {
    if ((err as DOMException)?.name === "NotFoundError") return;
    throw err;
  }
}

/**
 * OPFS 파일을 object URL로 노출. 브라우저는 URL.revokeObjectURL을 호출해 메모리 해제 필요.
 * 호출자가 useEffect cleanup 등에서 직접 revoke해야 한다.
 */
export async function getBlobUrl(ref: string): Promise<string | null> {
  const blob = await getBlob(ref);
  if (!blob) return null;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  return URL.createObjectURL(blob);
}

/**
 * 안전한 OPFS 파일명 생성. crypto.randomUUID 우선, fallback은 Math.random.
 * mimeType이 있으면 확장자 자동 부여.
 */
export function makeAttachmentFilename(mimeType?: string): string {
  let uid: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    uid = crypto.randomUUID();
  } else {
    uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const ext = mimeType ? mimeTypeToExt(mimeType) : "";
  return ext ? `${uid}.${ext}` : uid;
}

function mimeTypeToExt(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  switch (m) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/aac":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
      return "wav";
    case "application/pdf":
      return "pdf";
    default: {
      const slash = m.indexOf("/");
      if (slash === -1) return "";
      const sub = m.slice(slash + 1);
      // 슬래시 뒷부분이 영문/숫자만 있으면 그대로 쓰기 (예: "plain" → "plain")
      return /^[a-z0-9]+$/.test(sub) ? sub : "";
    }
  }
}

export async function quotaUsage(): Promise<QuotaInfo> {
  const storage = getStorage();
  if (typeof storage.estimate !== "function") {
    return { usage: 0, quota: 0, pct: 0 };
  }
  const est = await storage.estimate();
  const usage = est.usage ?? 0;
  const quota = est.quota ?? 0;
  const pct = quota > 0 ? usage / quota : 0;
  return { usage, quota, pct };
}
