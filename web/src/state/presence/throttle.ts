/**
 * FEAT-collab-auth n7 — Awareness 발행 스로틀 (작업 2).
 *
 * mousemove마다 Awareness를 쓰면 초당 수백 건이 네트워크로 나간다.
 * 초당 25회(40ms)로 제한하되 마지막 값을 놓치지 않도록 trailing을 둔다.
 * 커서 지연 기준은 p95 150ms라 40ms 상한은 그 안에 들어온다.
 */
export const AWARENESS_INTERVAL_MS = 40;

export interface ThrottleOptions {
  intervalMs?: number;
  /** 테스트용 시계 주입. 기본은 Date.now(). */
  now?: () => number;
}

export interface Throttled<A extends unknown[]> {
  (...args: A): void;
  /** 대기 중인 마지막 호출을 지금 즉시 보낸다. */
  flush(): void;
  /** 대기 중인 호출을 버린다. */
  cancel(): void;
}

export function createThrottle<A extends unknown[]>(
  fn: (...args: A) => void,
  { intervalMs = AWARENESS_INTERVAL_MS, now = () => Date.now() }: ThrottleOptions = {},
): Throttled<A> {
  let lastCall = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const invoke = (args: A): void => {
    lastCall = now();
    fn(...args);
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const throttled = ((...args: A): void => {
    const elapsed = now() - lastCall;
    if (elapsed >= intervalMs) {
      clearTimer();
      pending = null;
      invoke(args);
      return;
    }
    pending = args;
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        if (pending !== null) {
          const args = pending;
          pending = null;
          invoke(args);
        }
      }, intervalMs - elapsed);
    }
  }) as Throttled<A>;

  throttled.flush = (): void => {
    if (pending === null) return;
    const args = pending;
    pending = null;
    clearTimer();
    invoke(args);
  };

  throttled.cancel = (): void => {
    pending = null;
    clearTimer();
  };

  return throttled;
}
