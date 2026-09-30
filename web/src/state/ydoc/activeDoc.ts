import { clearDocument } from "y-indexeddb";
import { boardDocName, openBoardDoc, type BoardDocHandle } from "./doc";
import { normalizeBoardId } from "../boardIds";

/**
 * FEAT-collab-auth n3 — 보드별 Y.Doc 수명 관리.
 *
 * 스토어는 한 번에 한 보드만 화면에 띄운다. 활성 보드의 문서만 observer가
 * 스토어로 반영하고, 나머지 보드 문서는 쓰기 경로가 필요할 때 열어 캐시한다.
 *
 * 스토리지 boardId를 문서 키 문자열로 정규화한다. n1 이후 시스템 보드도 UUID
 * id를 쓰므로 null은 레거시 호환(마이그레이션 전 데이터)일 때만 나타난다.
 * 키는 y-indexeddb 이름(`moss-board-<key>`)에 그대로 들어간다.
 */

/**
 * 스토리지 boardId → 문서 키 문자열. 레거시 null은 시스템 보드 id로 정규화한다.
 *
 * 신뢰 경계 검사(가져온 번들의 시스템 id 거부)는 .moss 가져오기 경계가 맡는다 —
 * 내부 호출자가 시스템 키를 정상적으로 다룰 수 있어야 한다.
 */
export function docKeyForBoard(storageBoardId: string | null): string {
  return normalizeBoardId(storageBoardId);
}

const handles = new Map<string, BoardDocHandle>();
let activeKey: string | null = null;

/** n23 재심사 2R-7: 비활성 문서를 열어 두는 TTL. 여기(activeDoc)가 키 단위로 소유한다. */
export const INACTIVE_DOC_TTL_MS = 2000;
let inactiveDocTtlMs = INACTIVE_DOC_TTL_MS;
const closeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 테스트용 — TTL을 줄여 지연을 없앤다(0 이하면 즉시 닫기). */
export function __setInactiveDocTtlForTest(ms: number): void {
  inactiveDocTtlMs = ms;
}

function cancelCloseTimer(key: string): void {
  const existing = closeTimers.get(key);
  if (existing !== undefined) {
    clearTimeout(existing);
    closeTimers.delete(key);
  }
}

/**
 * 비활성 문서를 TTL 뒤 닫도록 예약한다. 같은 키를 다시 쓰면 타이머를 리셋한다.
 * TTL이 0 이하면 즉시 닫는다.
 */
export function scheduleInactiveClose(storageBoardId: string | null): void {
  const key = docKeyForBoard(storageBoardId);
  cancelCloseTimer(key);
  if (inactiveDocTtlMs <= 0) {
    closeBoardDocByKey(key);
    return;
  }
  const timer = setTimeout(() => {
    closeTimers.delete(key);
    closeBoardDocByKey(key);
  }, inactiveDocTtlMs);
  closeTimers.set(key, timer);
}

/** 문서를 열고 캐시한다(멱등). `whenLoaded`는 호출자가 기다린다. */
export function getOrOpenBoardDoc(storageBoardId: string | null): BoardDocHandle {
  const key = docKeyForBoard(storageBoardId);
  // n23 재심사 2R-7: 재오픈이면 예약된 close를 취소한다 — 방금 연 문서를 닫지 않게.
  cancelCloseTimer(key);
  let handle = handles.get(key);
  if (!handle) {
    handle = openBoardDoc(key);
    handles.set(key, handle);
  }
  return handle;
}

/** 지금 화면에 띄운 보드의 문서. 아직 열리지 않았으면 null. */
export function getActiveBoardDoc(): BoardDocHandle | null {
  return activeKey === null ? null : (handles.get(activeKey) ?? null);
}

export function isActiveBoard(storageBoardId: string | null): boolean {
  return activeKey === docKeyForBoard(storageBoardId);
}

/**
 * 보드를 활성화한다 — 문서를 열고 로컬 복원(`whenLoaded`)까지 기다린다.
 * 반환된 handle의 doc에 쓰기 전에 반드시 이 함수의 resolve 이후여야 한다.
 *
 * (n3 리뷰 P1) `activeKey`는 `whenLoaded` 성공 뒤에만 바꾼다. 실패하면 이전 활성
 * 키로 되돌려, 표시 중인 보드의 observer·로컬 쓰기가 조용히 유실되지 않게 한다.
 * 전환에 성공하면 이전 활성 보드 문서는 닫는다(비활성 문서 자원 해제, 6(h)).
 */
export async function activateBoardDoc(storageBoardId: string | null): Promise<BoardDocHandle> {
  const key = docKeyForBoard(storageBoardId);
  const prevKey = activeKey;
  const handle = getOrOpenBoardDoc(storageBoardId);
  try {
    await handle.whenLoaded;
  } catch (err) {
    // n23 P1-4: 로드에 실패한 핸들은 캐시에서 버린다. 남겨 두면 재시도가 rejected
    // 핸들을 다시 받아 영영 열지 못한다.
    discardBoardDocByKey(key);
    activeKey = prevKey;
    throw err;
  }
  activeKey = key;
  if (prevKey !== null && prevKey !== key) closeBoardDocByKey(prevKey);
  return handle;
}

/**
 * 열려 있는(비활성) 보드 문서를 닫는다. 활성 보드는 닫지 않는다 — 화면이 그
 * 문서를 쓰고 있다. `moveCardBetweenDocs`처럼 잠깐 연 문서를 정리할 때 쓴다.
 */
export function closeBoardDoc(storageBoardId: string | null): void {
  const key = docKeyForBoard(storageBoardId);
  if (key === activeKey) return;
  closeBoardDocByKey(key);
}

function closeBoardDocByKey(key: string): void {
  // n23 재심사 2R-7: 닫으면 예약된 close 타이머도 함께 정리한다.
  cancelCloseTimer(key);
  if (key === activeKey) return;
  const handle = handles.get(key);
  if (!handle) return;
  handles.delete(key);
  void handle.destroy().catch(() => {
    /* 열기에 실패한 문서는 닫을 것이 없다 */
  });
}

/**
 * n23 P1-4 / 재심사 2R-3: 열기에 실패했거나 더 이상 쓸 수 없는 핸들을 캐시에서
 * 버리고 닫는다. 재시도가 `getOrOpenBoardDoc`에서 새 핸들을 열 수 있게 한다.
 *
 * 활성 키라도 버린다 — 로드에 실패한 문서는 화면이 쓰고 있다고 볼 수 없다. 남겨
 * 두면 재시도가 rejected 핸들을 영영 받는다.
 */
export function discardBoardDocByKey(key: string): void {
  if (key === activeKey) activeKey = null;
  cancelCloseTimer(key);
  const handle = handles.get(key);
  if (!handle) return;
  handles.delete(key);
  void handle.destroy().catch(() => {
    /* 열기에 실패한 문서는 닫을 것이 없다 */
  });
}

/**
 * FEAT-collab-auth n9 — 보드 문서를 통째로 삭제한다(해제·내보내기, AC-13·AC-14).
 *
 * 열려 있으면 닫고 y-indexeddb 데이터베이스도 지운다. 어느 탭도 이 문서를 열고
 * 있지 않으면 캐시에 없을 수 있으므로 clearDocument가 이름으로 직접 지운다.
 */
export async function deleteBoardDoc(storageBoardId: string | null): Promise<void> {
  const key = docKeyForBoard(storageBoardId);
  if (key === activeKey) activeKey = null;
  cancelCloseTimer(key);
  const handle = handles.get(key);
  handles.delete(key);
  if (handle) {
    try {
      await handle.destroy();
    } catch {
      /* 열기에 실패한 문서는 닫을 것이 없다 */
    }
  }
  await clearDocument(boardDocName(key));
}

/** 테스트·재개 경계용 — 모든 문서를 닫는다. */
export async function destroyBoardDocs(): Promise<void> {
  for (const key of [...closeTimers.keys()]) cancelCloseTimer(key);
  const all = [...handles.values()];
  handles.clear();
  activeKey = null;
  await Promise.all(
    all.map((h) =>
      h.destroy().catch(() => {
        /* 열기에 실패한 문서는 닫을 것이 없다 */
      }),
    ),
  );
}

/** 재노출 — 호출자가 Y.Doc 타입을 알 필요 없게. */
export type { BoardDocHandle };

/** 테스트용 — 캐시에 열려 있는 문서 수(6(h) 비활성 문서 닫힘 검증). */
export function __openBoardDocCountForTest(): number {
  return handles.size;
}
