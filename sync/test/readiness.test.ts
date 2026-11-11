import { expect, test } from "bun:test";
import { checkDatabase } from "../src/readiness.ts";

test("readiness check is bounded even when the pool never yields a client", async () => {
  const pool = { query: () => new Promise<never>(() => {}) };
  const started = performance.now();
  await expect(checkDatabase(pool as never, 50)).rejects.toThrow("timed out");
  expect(performance.now() - started).toBeLessThan(1000);
});

test("readiness check sets a per-query timeout instead of a pool-wide one", async () => {
  const seen: unknown[] = [];
  const pool = { query: async (config: unknown) => { seen.push(config); return { rows: [] }; } };
  await checkDatabase(pool as never, 3000);
  expect(seen).toEqual([{ text: "SELECT 1 FROM documents LIMIT 1", query_timeout: 3000 }]);
});

test("index does not configure pool-wide query or connection timeouts", async () => {
  const source = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
  expect(source).not.toMatch(/query_timeout|connectionTimeoutMillis|statement_timeout/);
});
