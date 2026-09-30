import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryDocumentStore } from "../src/documentStore.ts";
import { createGuardedStore } from "../src/guardedStore.ts";

const BOARD = "22222222-2222-4222-8222-222222222222";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("createGuardedStore", () => {
  let inner: MemoryDocumentStore;
  let alive: boolean;
  const warnings: string[] = [];

  beforeEach(() => {
    inner = new MemoryDocumentStore();
    alive = true;
    warnings.length = 0;
  });

  function make(maxBytes = 1024) {
    return createGuardedStore(inner, {
      maxBytes,
      boardExists: async () => alive,
      logger: { warn: (message: string) => void warnings.push(message) },
    });
  }

  test("persists updates below the size limit", async () => {
    const store = make();
    const outcome = await store.store(BOARD, bytes("hello"));
    expect(outcome).toEqual({ stored: true, bytes: 5 });
    expect(inner.has(BOARD)).toBe(true);
    expect(new TextDecoder().decode((await store.fetch(BOARD)) ?? new Uint8Array())).toBe("hello");
  });

  test("drops (warn, never throws) a document over the size limit", async () => {
    const store = make(8);
    const outcome = await store.store(BOARD, bytes("this is too long"));
    expect(outcome).toEqual({ stored: false, reason: "too_large" });
    expect(inner.has(BOARD)).toBe(false);
    expect(warnings.some((w) => w.includes("over the"))).toBe(true);
  });

  test("drops updates for a board whose row is gone (revoke)", async () => {
    const store = make();
    await store.store(BOARD, bytes("before"));
    alive = false;
    const outcome = await store.store(BOARD, bytes("after-revoke"));
    expect(outcome).toEqual({ stored: false, reason: "board_gone" });
    expect(new TextDecoder().decode((await store.fetch(BOARD)) ?? new Uint8Array())).toBe("before");
    expect(warnings.some((w) => w.includes("no longer exists"))).toBe(true);
  });

  test("drops updates when the board check itself fails", async () => {
    const store = createGuardedStore(inner, {
      maxBytes: 1024,
      boardExists: async () => {
        throw new Error("postgres down");
      },
      logger: { warn: () => {} },
    });
    const outcome = await store.store(BOARD, bytes("should be dropped"));
    expect(outcome).toEqual({ stored: false, reason: "check_failed" });
    expect(inner.has(BOARD)).toBe(false);
  });

  /**
   * [P1] Revoke race: a debounced store must not insert a snapshot after the
   * board's row was deleted. store and delete share a per-board lock, so the
   * delete always lands after an in-flight store (and a store queued behind the
   * delete re-checks `boardExists`).
   */
  test("an in-flight store cannot resurrect a snapshot after delete", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createGuardedStore(
      {
        fetch: (name) => inner.fetch(name),
        store: async (name, state) => {
          await gate;
          await inner.store(name, state);
        },
        delete: (name) => inner.delete(name),
      },
      { maxBytes: 1024, boardExists: async () => alive, logger: { warn: () => {} } },
    );

    const storing = store.store(BOARD, bytes("resurrect"));
    // Let the store acquire the board lock and reach the gated inner store.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const deleting = store.delete(BOARD);

    release();
    await Promise.all([storing, deleting]);

    expect(inner.has(BOARD)).toBe(false);
  });

  test("delete removes the snapshot", async () => {
    const store = make();
    await store.store(BOARD, bytes("snapshot"));
    await store.delete(BOARD);
    expect(inner.has(BOARD)).toBe(false);
  });
});
