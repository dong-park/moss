import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";
import type { Client } from "pg";
import type { SyncConfig } from "../src/config.ts";

export const TEST_SECRET = "test-secret-at-least-32-bytes-long!!";
export const TEST_INTERNAL_SECRET = "test-internal-secret";

/** Full runtime config for tests; defaults mirror `loadConfig`. */
export function makeConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    port: 0,
    internalPort: 0,
    internalHost: "127.0.0.1",
    internalSecret: TEST_INTERNAL_SECRET,
    databaseUrl: "postgres://unused",
    jwtSecret: TEST_SECRET,
    maxDocumentBytes: 10 * 1024 * 1024,
    maxConnectionsPerBoard: 10,
    debounceMs: 50,
    maxDebounceMs: 200,
    ...overrides,
  };
}

/**
 * The `documents` table now comes from n4's Flyway `V3__documents.sql`, so the
 * sync unit tests create the same shape directly.
 */
export async function createDocumentsTable(client: Client): Promise<void> {
  await client.query(`
    create table if not exists documents (
      name text primary key,
      data bytea not null,
      updated_at bigint not null
    )
  `);
}

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export interface EmbeddedPgHandle {
  pg: EmbeddedPostgres;
  port: number;
  stop(): Promise<void>;
}

export async function startEmbeddedPg(): Promise<EmbeddedPgHandle> {
  const databaseDir = await mkdtemp(join(tmpdir(), "moss-sync-pg-"));
  const port = await getFreePort();
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  return { pg, port, stop: () => pg.stop() };
}

export interface TokenOptions {
  userId: string;
  boardId: string;
  secret?: string;
  type?: string;
  issuer?: string;
  expiresIn?: string | number;
}

export async function signBoardToken(options: TokenOptions): Promise<string> {
  const secret = options.secret ?? TEST_SECRET;
  const builder = new SignJWT({
    typ: options.type ?? "board",
    boardId: options.boardId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(options.issuer ?? "moss")
    .setSubject(options.userId)
    .setIssuedAt();
  if (options.expiresIn !== undefined) {
    builder.setExpirationTime(options.expiresIn);
  }
  return builder.sign(new TextEncoder().encode(secret));
}

export function waitFor(
  predicate: () => boolean,
  { timeoutMs = 5000, intervalMs = 25, label = "condition" } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
