/**
 * 공유 중인 벽 id를 이 기기에 남긴다.
 *
 * `useShare.byBoard`는 메모리뿐이라 새로고침하면 `syncMyBoards`(로그인 + 네트워크)가 끝나야만
 * 복원된다. 오프라인이거나 세션이 만료된 채 새로고침하면 공유 중인 벽이 "이 기기에만"으로 보이고,
 * 그 상태에서 다시 공유하면 서버 행을 새로 만드는 길로 들어간다. 그래서 공유 중인 벽 id와 역할만
 * localStorage에 둔다 — 토큰·멤버는 두지 않는다.
 *
 * 값은 `{userId, boards}`다. 한 기기에 다른 계정이 들어올 수 있어서, 누구의 공유 목록인지 같이 남기고
 * 지금 로그인한 계정과 다르면 쓰지 않는다 — 다른 계정의 서버 목록에 없다고 남의 원격 사본을 지우면
 * 안 된다. 계정이 적히지 않은 옛 형식은 누구의 것인지 알 수 없으니 읽지 않고 버린다.
 *
 * 쓰기는 통째로 덮지 않고 이 탭이 바꾼 것(추가·제거)만 읽은 값에 반영한다. 두 탭이 서로의 공유를
 * 덮어써 지우지 않게 하려는 것이다. 단, 값이 없거나(로그아웃으로 지워졌다) 주인이 다른 계정이면
 * 변경분이 아니라 이 탭의 확인된 공유 전체로 새로 쓴다.
 */
import type { MemberRole } from "./types";

const KEY = "moss:sharedBoards";

/** 보드 id → 역할. 역할을 모르면 null(fail-closed). */
export type PersistedShared = Record<string, MemberRole | null>;

/** 기기에 남은 공유 목록과 그 주인 계정. */
export interface PersistedShareState {
  userId: string;
  boards: PersistedShared;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** 형식이 맞지 않거나 계정이 없는 옛 값이면 null. */
function parse(raw: string | null): PersistedShareState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { userId, boards } = value as { userId?: unknown; boards?: unknown };
    if (typeof userId !== "string" || userId === "") return null;
    if (!boards || typeof boards !== "object" || Array.isArray(boards)) return null;
    const out: PersistedShared = {};
    for (const [id, role] of Object.entries(boards as Record<string, unknown>)) {
      out[id] = role === "owner" || role === "editor" ? role : null;
    }
    return { userId, boards: out };
  } catch {
    return null;
  }
}

/** 기기에 남은 공유 중인 벽. 읽지 못하거나 옛 형식이면 null — 이 경우 서버 동기화가 채운다. */
export function readPersistedShared(): PersistedShareState | null {
  const ls = storage();
  if (!ls) return null;
  try {
    return parse(ls.getItem(KEY));
  } catch {
    return null;
  }
}

/**
 * 이 탭이 공유로 바꾼 것(`added`)과 공유에서 뺀 것(`removed`)을 `userId`의 목록에 반영한다.
 *
 * 저장된 값이 없거나(다른 탭이 로그아웃으로 지웠다) 다른 계정의 것이면 변경분만으로는 목록이
 * 줄어든다 — 이 탭이 알고 있는 나머지 공유가 기록에서 빠져, 같은 계정의 다른 탭이 그 벽을
 * "해제됐다"로 읽고 연결을 끊는다. 그래서 그때는 이 탭의 확인된 공유 전체(`confirmed`)를 바탕으로 쓴다.
 * 값이 있는 같은 계정의 기록 위에서는 기존대로 변경분만 반영한다.
 */
export function applyPersistedSharedChange(
  userId: string,
  added: PersistedShared,
  removed: readonly string[],
  confirmed: PersistedShared = {},
): void {
  const ls = storage();
  if (!ls) return;
  try {
    const raw = ls.getItem(KEY);
    const current = parse(raw);
    const base = current && current.userId === userId ? current.boards : confirmed;
    const boards: PersistedShared = { ...base, ...added };
    for (const id of removed) delete boards[id];
    const text = JSON.stringify({ userId, boards } satisfies PersistedShareState);
    // 같은 값이면 쓰지 않는다 — 다른 탭의 storage 이벤트가 되돌아오지 않게.
    if (text !== raw) ls.setItem(KEY, text);
  } catch {
    /* 저장 공간이 없거나 막혔다 — 이 탭의 상태는 그대로 쓴다 */
  }
}

/** 기기에 남은 공유 목록을 지운다 — 로그아웃·계정 전환. */
export function clearPersistedShared(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(KEY);
  } catch {
    /* 막힌 저장소 — 다음 쓰기가 덮는다 */
  }
}

/**
 * 다른 탭이 공유 목록을 바꿨을 때 부른다. 해제하면 정리한다.
 * 값이 지워졌거나(로그아웃) 읽을 수 없으면 부르지 않는다 — "전부 해제됐다"가 아니다.
 */
export function onPersistedSharedChange(
  listener: (value: PersistedShareState) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key !== null && event.key !== KEY) return;
    const value = readPersistedShared();
    if (value) listener(value);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
