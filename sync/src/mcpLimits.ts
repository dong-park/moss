/** Request limits of the remote MCP endpoint (RM-6): concurrency, calls per minute, changes per request. */

export interface McpLimits {
  /** Requests one user may have in flight; more get HTTP 429. */
  maxConcurrentPerUser: number;
  /** Tool calls (reads and writes) one user may make per minute. */
  callsPerMinute: number;
  /** Write tool calls one user may make per minute. */
  writesPerMinute: number;
  /** Changes one write call may apply. The rest of a larger request is not applied. */
  maxChangesPerRequest: number;
  /** Snapshots decoded at the same time across all users, so a burst of searches cannot starve sync. */
  maxConcurrentSnapshotReads: number;
  /** Total snapshot bytes one search may read. */
  maxSearchSnapshotBytes: number;
}

export const DEFAULT_MCP_LIMITS: McpLimits = {
  maxConcurrentPerUser: 2,
  callsPerMinute: 120,
  writesPerMinute: 30,
  maxChangesPerRequest: 20,
  maxConcurrentSnapshotReads: 4,
  maxSearchSnapshotBytes: 30 * 1024 * 1024,
};

const WINDOW_MS = 60_000;

/** Raised when a call is over the per-minute limit. `retryAt` is when the oldest counted call leaves the window. */
export class McpRateLimitError extends Error {
  constructor(
    what: string,
    readonly limit: number,
    readonly retryAt: Date,
    readonly retryAfterSeconds: number,
  ) {
    super(
      what + "이 너무 잦아요. 분당 " + limit + "회까지예요. " +
        retryAfterSeconds + "초 뒤(" + retryAt.toISOString() + " 이후)에 다시 시도하세요.",
    );
    this.name = "McpRateLimitError";
  }
}

/** Per-user in-memory counters. One sync process serves the endpoint (no Redis, per the spec's non-goals). */
export class McpLimiter {
  readonly limits: McpLimits;
  private readonly active = new Map<string, number>();
  private readonly calls = new Map<string, number[]>();
  private readonly writes = new Map<string, number[]>();

  constructor(limits: Partial<McpLimits> = {}, private readonly now: () => number = Date.now) {
    this.limits = { ...DEFAULT_MCP_LIMITS, ...limits };
  }

  /** Takes an in-flight slot. Returns the release function, or null when the user is at the cap. */
  enter(userId: string): (() => void) | null {
    const current = this.active.get(userId) ?? 0;
    if (current >= this.limits.maxConcurrentPerUser) return null;
    this.active.set(userId, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.active.get(userId) ?? 1) - 1;
      if (left <= 0) this.active.delete(userId);
      else this.active.set(userId, left);
    };
  }

  /** Counts one tool call. Throws [McpRateLimitError] without counting when over the limit. */
  consume(userId: string, write: boolean): void {
    const now = this.now();
    const calls = this.recent(this.calls, userId, now);
    const writes = this.recent(this.writes, userId, now);
    if (calls.length >= this.limits.callsPerMinute) this.reject("호출", this.limits.callsPerMinute, calls, now);
    if (write && writes.length >= this.limits.writesPerMinute) {
      this.reject("쓰기 호출", this.limits.writesPerMinute, writes, now);
    }
    calls.push(now);
    this.calls.set(userId, calls);
    if (write) {
      writes.push(now);
      this.writes.set(userId, writes);
    }
  }

  /** Stamps inside the window. Users with none left are dropped, so idle users cost no memory. */
  private recent(table: Map<string, number[]>, userId: string, now: number): number[] {
    const stamps = (table.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
    if (stamps.length === 0) table.delete(userId);
    else table.set(userId, stamps);
    return stamps;
  }

  private reject(what: string, limit: number, stamps: number[], now: number): never {
    const retryAt = new Date((stamps[0] ?? now) + WINDOW_MS);
    throw new McpRateLimitError(what, limit, retryAt, Math.max(1, Math.ceil((retryAt.getTime() - now) / 1000)));
  }
}

/** Counting semaphore that queues waiters in order. */
export class Semaphore {
  private free: number;
  private readonly waiting: Array<() => void> = [];

  constructor(size: number) {
    this.free = size;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free -= 1;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next !== undefined) next();
      else this.free += 1;
    }
  }
}

/** Snapshot bytes one search has read so far. */
export class SnapshotBudget {
  used = 0;
  constructor(readonly limitBytes: number) {}
}
