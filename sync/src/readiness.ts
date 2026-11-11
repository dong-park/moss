import type { Pool } from "pg";

/**
 * Readiness-only database check. The deadline covers waiting for a pooled client and
 * the query; a timed-out query is cancelled server-side through its own per-query timeout.
 * It never changes the timeouts of business queries sharing the pool.
 */
export async function checkDatabase(pool: Pick<Pool, "query">, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("readiness database check timed out")), timeoutMs);
  });
  const query: Promise<unknown> = (pool.query as (config: unknown) => Promise<unknown>)(
    { text: "SELECT 1 FROM documents LIMIT 1", query_timeout: timeoutMs });
  query.catch(() => {}); // the deadline may win; never leave an unhandled rejection behind
  try {
    await Promise.race([query, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
