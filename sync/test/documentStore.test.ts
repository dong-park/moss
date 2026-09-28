import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Client } from "pg";
import { ensureDocumentsTable, PostgresDocumentStore } from "../src/documentStore.ts";
import { createDocumentsTable, startEmbeddedPg, type EmbeddedPgHandle } from "./helpers.ts";

const BOARD = "22222222-2222-4222-8222-222222222222";

describe("PostgresDocumentStore (embedded Postgres, no Docker)", () => {
  let pgHandle: EmbeddedPgHandle;
  let client: Client;
  let store: PostgresDocumentStore;

  beforeAll(async () => {
    pgHandle = await startEmbeddedPg();
    client = pgHandle.pg.getPgClient();
    await client.connect();
    await createDocumentsTable(client);
    store = new PostgresDocumentStore(client);
  });

  afterAll(async () => {
    await client.end();
    await pgHandle.stop();
  });

  test("round-trips a Yjs-style binary snapshot", async () => {
    const state = Uint8Array.from([0, 1, 2, 255, 254, 10, 13, 0, 7]);
    await store.store(BOARD, state);
    const loaded = await store.fetch(BOARD);
    expect(loaded).not.toBeNull();
    expect(Uint8Array.from(loaded as Uint8Array)).toEqual(state);
  });

  test("overwrites the snapshot on the next store", async () => {
    await store.store(BOARD, Uint8Array.from([1, 1, 1]));
    await store.store(BOARD, Uint8Array.from([2, 2]));
    expect(Uint8Array.from((await store.fetch(BOARD)) as Uint8Array)).toEqual(Uint8Array.from([2, 2]));
  });

  test("returns null for a document that was never stored", async () => {
    expect(await store.fetch("44444444-4444-4444-8444-444444444444")).toBeNull();
  });

  test("the documents table has the n4 Flyway shape", async () => {
    const result = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' ORDER BY column_name",
    );
    expect(result.rows.map((row) => row.column_name)).toEqual(["data", "name", "updated_at"]);
  });

  test("delete removes the snapshot row (AC-13 revoke)", async () => {
    await store.store(BOARD, Uint8Array.from([9, 9]));
    await store.delete(BOARD);
    expect(await store.fetch(BOARD)).toBeNull();
  });
});

describe("ensureDocumentsTable", () => {
  /**
   * [P1] sync must not bind before Ktor's Flyway creates `documents`. It retries
   * the probe, then fails startup if the table never shows up.
   */
  test("retries until the table exists", async () => {
    let calls = 0;
    const db = {
      query: async (): Promise<{ rows: Array<Record<string, unknown>> }> => {
        calls += 1;
        if (calls < 3) throw new Error('relation "documents" does not exist');
        return { rows: [] };
      },
    };
    await ensureDocumentsTable(db, { attempts: 5, delayMs: 1 });
    expect(calls).toBe(3);
  });

  test("fails startup when the table never appears", async () => {
    const db = {
      query: async (): Promise<{ rows: Array<Record<string, unknown>> }> => {
        throw new Error('relation "documents" does not exist');
      },
    };
    await expect(ensureDocumentsTable(db, { attempts: 2, delayMs: 1 })).rejects.toThrow(
      /documents table is not available/,
    );
  });
});
