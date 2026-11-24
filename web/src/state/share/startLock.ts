/**
 * 공유 시작 중인 벽을 탭 사이에 알린다.
 *
 * `startShare`의 in-flight 가드는 탭 메모리라 같은 벽을 두 탭이 동시에 공유하는 것을 못 막는다.
 * 확인형 업로드가 최대 5분까지 기다리므로 그 창이 넓다 — 두 탭이 같은 서버 행을 놓고 달리다가
 * 늦게 실패한 탭이 "내가 만든 행"을 지우면 다른 탭이 성공시킨 공유 행이 사라진다.
 *
 * localStorage에 벽별 락(소유 탭 토큰 + 만료 시각)을 둔다. 시작한 탭은 진행하는 동안 만료를
 * 미뤄 주고(heartbeat), 탭이 죽으면 만료로 풀린다. 락을 못 얻으면 이 탭은 시작하지 않는다.
 *
 * localStorage 에는 원자적 비교-교환이 없어서 "읽고 쓰고 다시 읽어 내 것인지 확인"으로 줄일 뿐
 * 완전히 막지는 못한다. 남는 틈은 두 탭이 같은 ms 안에 동시에 쓰는 경우뿐이다.
 */

const KEY_PREFIX = "moss:shareStarting:";

/** 탭이 죽었을 때 락이 남아 있는 시간. heartbeat 가 이 안에 계속 연장한다. */
export const START_LOCK_TTL_MS = 30_000;
/** 진행 중인 탭이 만료를 미루는 간격. */
export const START_LOCK_HEARTBEAT_MS = 10_000;

/** 이 탭을 가리는 값 — 탭마다 다르다. */
const tabToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface LockValue {
  token: string;
  expiresAt: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(ls: Storage, boardId: string): LockValue | null {
  try {
    const raw = ls.getItem(KEY_PREFIX + boardId);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LockValue>;
    if (typeof value.token !== "string" || typeof value.expiresAt !== "number") return null;
    return { token: value.token, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

/** 다른 탭이 이 벽의 공유를 시작하는 중인가. 만료된 락은 없는 것으로 본다. */
export function isStartingInAnotherTab(boardId: string): boolean {
  const ls = storage();
  if (!ls) return false;
  const lock = read(ls, boardId);
  return lock !== null && lock.token !== tabToken && lock.expiresAt > Date.now();
}

export interface ShareStartLock {
  release(): void;
}

/**
 * 이 벽의 공유 시작 락을 얻는다. 다른 탭이 시작 중이면 null.
 * 저장소를 못 쓰면(막힌 환경) 락 없이 진행한다 — 이 탭의 in-flight 가드만 남는다.
 */
export function acquireShareStartLock(boardId: string): ShareStartLock | null {
  const ls = storage();
  if (!ls) return { release() {} };
  if (isStartingInAnotherTab(boardId)) return null;

  const key = KEY_PREFIX + boardId;
  const write = () => {
    try {
      ls.setItem(key, JSON.stringify({ token: tabToken, expiresAt: Date.now() + START_LOCK_TTL_MS }));
    } catch {
      /* 쓰지 못하면 이 탭만 막는다 */
    }
  };
  write();
  // 같은 틈에 다른 탭이 먼저 썼다면 내 값이 아니다 — 양보한다.
  const after = read(ls, boardId);
  if (after && after.token !== tabToken) return null;

  const beat = setInterval(() => {
    const current = read(ls, boardId);
    // 만료돼 다른 탭이 가져갔다면 되찾지 않는다.
    if (current && current.token !== tabToken) return;
    write();
  }, START_LOCK_HEARTBEAT_MS);

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      clearInterval(beat);
      try {
        const current = read(ls, boardId);
        if (!current || current.token === tabToken) ls.removeItem(key);
      } catch {
        /* 만료로 풀린다 */
      }
    },
  };
}
