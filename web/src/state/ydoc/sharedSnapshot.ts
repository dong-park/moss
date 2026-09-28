import type { SharedNote } from "./model";

/**
 * FEAT-collab-auth n23 재심사 2R-2 — 문서에 마지막으로 쓴 공유 필드 스냅샷.
 *
 * 로컬이 실제로 바꾼 필드만 문서에 쓴다(원격이 바꾼 필드를 낡은 로컬 값으로 덮지
 * 않게). 문서 쓰기를 소유하는 모든 경로(카드 영속·좌표 커밋·휴지통 복구·크로스보드
 * 이동)가 이 스냅샷을 갱신하고, 메모 삭제 경로는 반드시 버린다(누수 방지).
 *
 * leaf 모듈이라 workspace(writeThrough 경유)와 writeThrough가 순환 없이 함께 쓴다.
 */
const lastSharedByNote = new Map<string, SharedNote>();

export function getSharedSnapshot(noteId: string): SharedNote | undefined {
  return lastSharedByNote.get(noteId);
}

export function setSharedSnapshot(noteId: string, shared: SharedNote): void {
  lastSharedByNote.set(noteId, shared);
}

export function forgetSharedSnapshot(noteId: string): void {
  lastSharedByNote.delete(noteId);
}

export function clearSharedSnapshots(): void {
  lastSharedByNote.clear();
}
