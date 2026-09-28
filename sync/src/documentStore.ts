/**
 * Snapshot persistence for Hocuspocus documents.
 *
 * The `documents` table is created by n4's Flyway migration
 * `V3__documents.sql`; the sync server never runs DDL. `documents` is keyed by
 * the Hocuspocus document name, which is the board id.
 */

export interface DocumentStore {
  fetch(name: string): Promise<Uint8Array | null>;
  store(name: string, state: Uint8Array): Promise<void>;
  /** Removes the snapshot, e.g. when a board share is revoked (AC-13). */
  delete(name: string): Promise<void>;
}

/** Minimal node-postgres surface so tests can inject a client or a pool. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface EnsureDocumentsOptions {
  /** Number of probes before giving up. */
  attempts?: number;
  /** Delay between probes, in milliseconds. */
  delayMs?: number;
}

/**
 * [P1] The `documents` table is created by Ktor's Flyway migration in another
 * container. If sync binds before Ktor migrates, the first fetch/store fails
 * with "relation does not exist" and edits in that window are lost. Probe until
 * the table shows up, then fail startup if it never does (compose orders sync
 * after the server healthcheck, this is the belt-and-braces guard).
 */
export async function ensureDocumentsTable(
  db: Queryable,
  opts: EnsureDocumentsOptions = {},
): Promise<void> {
  const attempts = opts.attempts ?? 60;
  const delayMs = opts.delayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await db.query("SELECT 1 FROM documents LIMIT 1");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new Error(
    `documents table is not available after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new Uint8Array(Buffer.from(value, "binary"));
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("documents.data is not binary");
}

export class PostgresDocumentStore implements DocumentStore {
  constructor(private readonly db: Queryable) {}

  async fetch(name: string): Promise<Uint8Array | null> {
    const result = await this.db.query("SELECT data FROM documents WHERE name = $1", [name]);
    const row = result.rows[0];
    if (row === undefined) return null;
    return toBytes(row.data);
  }

  async store(name: string, state: Uint8Array): Promise<void> {
    // `state` is a Uint8Array; node-postgres wraps it as a Buffer view without
    // copying, so no defensive Buffer.from() is needed here.
    await this.db.query(
      `INSERT INTO documents (name, data, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [name, state, Date.now()],
    );
  }

  async delete(name: string): Promise<void> {
    await this.db.query("DELETE FROM documents WHERE name = $1", [name]);
  }
}

/** In-memory store for tests and local runs without Postgres. */
export class MemoryDocumentStore implements DocumentStore {
  private readonly rows = new Map<string, Uint8Array>();

  async fetch(name: string): Promise<Uint8Array | null> {
    const row = this.rows.get(name);
    return row === undefined ? null : Uint8Array.from(row);
  }

  async store(name: string, state: Uint8Array): Promise<void> {
    this.rows.set(name, Uint8Array.from(state));
  }

  async delete(name: string): Promise<void> {
    this.rows.delete(name);
  }

  get size(): number {
    return this.rows.size;
  }

  has(name: string): boolean {
    return this.rows.has(name);
  }
}
