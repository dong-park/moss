/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-editor-seams (P0) — 카드 영속 디바운스 + flush seam.
 *
 * workspace.ts에 있던 debounce 타이머 기계를 분리하고 flush 진입점을 추가한다.
 * persistCard 본문(useStorage·encodeCardContent 의존)은 workspace.ts에 남기고
 * "실행 클로저"만 주입받으므로 순환 의존이 없다 — 동작은 이전과 동일(300ms,
 * last-write-wins). flushCard/flushAll은 W1(자동저장 유실 가드)이 언마운트·
 * beforeunload에서 호출해 디바운스 창 안의 마지막 편집 유실을 막는다.
 * ───────────────────────────────────────────────────────────── */

type PersistRun = () => Promise<void>;

const DEBOUNCE_MS = 300;
const timers = new Map<
  string,
  { handle: ReturnType<typeof setTimeout>; run: PersistRun }
>();

/*
 * cmd-z-undo 웨이브 4 리뷰(W4-5): 이미 시작된 미러 쓰기. cancelPersist는 타이머만 지운다 —
 * 돌고 있는 쓰기(saveNote의 get 뒤 put)는 못 멈춘다. 미러 행을 지우는 쪽(휴지통·기록 보관·
 * 영구 삭제)은 persistSettled로 그 쓰기가 끝난 뒤 지운다. 안 그러면 늦은 put이 행을 되살린다.
 */
const inflight = new Map<string, Promise<void>>();
const noop = () => undefined;

function track(id: string, p: Promise<void>): Promise<void> {
  const quiet = p.then(noop, noop);
  const prev = inflight.get(id);
  const settled = prev ? Promise.all([prev, quiet]).then(noop) : quiet;
  inflight.set(id, settled);
  void settled.then(() => {
    if (inflight.get(id) === settled) inflight.delete(id);
  });
  return p;
}

/**
 * 예약을 거치지 않고 바로 시작한 미러 쓰기도 진행 중으로 센다(웨이브 5 리뷰 W5-2). 만들기의
 * persistCard가 그렇다. 미러를 읽고 고쳐 쓰는 보드 이전이 persistSettled로 이 쓰기를 기다린다 —
 * 안 기다리면 get·merge·put이 엇갈려 만들기의 kind·ref가 사라진다.
 */
export function trackPersist<T>(id: string, p: Promise<T>): Promise<T> {
  track(id, p.then(noop));
  return p;
}

/** id별 영속을 300ms 디바운스로 예약. 같은 id 재예약 시 직전 것을 대체(최신 우선). */
export function schedulePersist(id: string, run: PersistRun): void {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing.handle);
  const handle = setTimeout(() => {
    timers.delete(id);
    void track(id, run());
  }, DEBOUNCE_MS);
  timers.set(id, { handle, run });
}

/** 대기 중인 id의 영속을 즉시 실행(디바운스 무시). 없으면 no-op. */
export function flushCard(id: string): Promise<void> {
  const entry = timers.get(id);
  if (!entry) return Promise.resolve();
  clearTimeout(entry.handle);
  timers.delete(id);
  return track(id, entry.run());
}

/** 이미 시작된 id의 미러 쓰기가 있는가. 예약만 된 쓰기는 세지 않는다. */
export function isPersistInFlight(id: string): boolean {
  return inflight.has(id);
}

/** ids의 이미 시작된 미러 쓰기가 모두 끝나면 풀린다(성공·실패 무관). 예약만 된 쓰기는 기다리지 않는다. */
export function persistSettled(ids: Iterable<string>): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const id of ids) {
    const p = inflight.get(id);
    if (p) waits.push(p);
  }
  return waits.length === 0 ? Promise.resolve() : Promise.all(waits).then(noop);
}

/*
 * 연결선 미러 쓰기(원격 반영의 0.3초 디바운스 flushConnections)도 같다. 문서를 읽은 뒤 put이
 * 늦게 닿으면 휴지통으로 옮긴 연결선의 미러 행이 되살아난다. 연결선을 휴지통으로 옮기는
 * 쪽은 connectionMirrorSettled로 앞선 쓰기가 끝난 뒤 옮긴다.
 */
let connectionWrites: Promise<void> = Promise.resolve();

/** 시작한 연결선 미러 쓰기를 등록한다. */
export function trackConnectionMirrorWrite(p: Promise<void>): Promise<void> {
  connectionWrites = Promise.all([connectionWrites, p.then(noop, noop)]).then(noop);
  return p;
}

/** 지금까지 시작한 연결선 미러 쓰기가 모두 끝나면 풀린다. */
export function connectionMirrorSettled(): Promise<void> {
  return connectionWrites;
}

/**
 * 대기 중인 영속을 실행하지 않고 취소(카드 삭제 시 — 지운 카드를 다시 쓰지 않게).
 * 이미 시작된 쓰기는 못 멈춘다 — 미러 행을 지우는 쪽이 persistSettled를 기다린다.
 */
export function cancelPersist(id: string): void {
  const entry = timers.get(id);
  if (!entry) return;
  clearTimeout(entry.handle);
  timers.delete(id);
}

/** 대기 중인 모든 카드를 즉시 flush(언마운트/beforeunload). */
export function flushAll(): Promise<void> {
  const ids = [...timers.keys()];
  return Promise.all(ids.map((id) => flushCard(id))).then(() => undefined);
}

/** 테스트용 — 대기 중 타이머 수. */
export function __pendingCount(): number {
  return timers.size;
}
