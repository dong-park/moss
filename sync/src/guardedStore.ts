import type { DocumentStore } from "./documentStore.ts";

/** True while the board row still exists (n4 deletes it on revoke). */
export type BoardExists = (boardId: string) => Promise<boolean>;

/** Why a snapshot was not persisted. `too_large` is surfaced to the client. */
export type StoreDropReason = "too_large" | "board_gone" | "check_failed";

export type StoreOutcome =
  | { stored: true; bytes: number }
  | { stored: false; reason: StoreDropReason };

export interface GuardedStoreOptions {
  maxBytes: number;
  boardExists: BoardExists;
  logger?: Pick<Console, "warn">;
}

/** A store that reports whether the snapshot was persisted (and why not). */
export interface GuardedStore {
  fetch(name: string): Promise<Uint8Array | null>;
  store(name: string, state: Uint8Array): Promise<StoreOutcome>;
  delete(name: string): Promise<void>;
}

/**
 * Serializes work per board id. `store` and `delete` share one lock so a
 * debounced store can never interleave with a revoke: either it finishes before
 * the delete (and the delete wins), or it runs after and its `boardExists`
 * re-check discards it. Different boards still run concurrently.
 */
type BoardLock = <T>(key: string, fn: () => Promise<T>) => Promise<T>;

function createBoardLock(): BoardLock {
  const tails = new Map<string, Promise<void>>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.then(fn);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}

/**
 * Wraps the configured store with the two server-level write policies:
 *
 *  1. drop (warn, never throw) documents over the size limit (spec §7
 *     "문서 10MB") and report `too_large` so the caller can tell the client.
 *     Throwing here would reject inside the Hocuspocus debounced
 *     `onStoreDocument` path and surface as an unhandled rejection that kills
 *     the process.
 *  2. drop writes for a board whose share was revoked. The board row is the
 *     source of truth: n4 deletes it before firing the close hook, so a late
 *     update finds no board and is discarded (spec §7 "해제 뒤 도착한 업데이트는
 *     무시한다"). No process-local revocation state is needed.
 *
 * Reads are not affected: after a revoke no client can authenticate, so a fetch
 * returning the old snapshot is unreachable.
 */
export function createGuardedStore(
  inner: DocumentStore,
  opts: GuardedStoreOptions,
): GuardedStore {
  const log = opts.logger ?? console;
  const lock = createBoardLock();
  return {
    fetch: (name) => inner.fetch(name),
    store: (name, state) =>
      lock(name, async () => {
        if (state.byteLength > opts.maxBytes) {
          log.warn(
            `dropping snapshot for board ${name}: ${state.byteLength} bytes over the ${opts.maxBytes} byte limit`,
          );
          return { stored: false, reason: "too_large" };
        }
        let alive: boolean;
        try {
          alive = await opts.boardExists(name);
        } catch (error) {
          log.warn(
            `dropping snapshot for board ${name}: board check failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { stored: false, reason: "check_failed" };
        }
        if (!alive) {
          log.warn(`dropping snapshot for board ${name}: board no longer exists`);
          return { stored: false, reason: "board_gone" };
        }
        await inner.store(name, state);
        return { stored: true, bytes: state.byteLength };
      }),
    // Shares the board lock so a revoke cannot race an in-flight store.
    delete: (name) => lock(name, () => inner.delete(name)),
  };
}
