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

/** id별 영속을 300ms 디바운스로 예약. 같은 id 재예약 시 직전 것을 대체(최신 우선). */
export function schedulePersist(id: string, run: PersistRun): void {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing.handle);
  const handle = setTimeout(() => {
    timers.delete(id);
    void run();
  }, DEBOUNCE_MS);
  timers.set(id, { handle, run });
}

/** 대기 중인 id의 영속을 즉시 실행(디바운스 무시). 없으면 no-op. */
export function flushCard(id: string): Promise<void> {
  const entry = timers.get(id);
  if (!entry) return Promise.resolve();
  clearTimeout(entry.handle);
  timers.delete(id);
  return entry.run();
}

/** 대기 중인 영속을 실행하지 않고 취소(카드 삭제 시 — 지운 카드를 다시 쓰지 않게). */
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
