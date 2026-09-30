/**
 * Runtime configuration for the Hocuspocus sync server (n5).
 *
 * Contract with n4 (docs/specs/FEAT-collab-auth/n4-server-ktor.md):
 *  - `JWT_SECRET` is shared with Ktor, at least 32 bytes, no default.
 *  - Board token issuer is `moss` with claims `typ=board`, `sub`, `boardId`.
 */

export const MIN_JWT_SECRET_BYTES = 32;
export const DEFAULT_MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Concurrent connections allowed per board (spec §4). */
export const DEFAULT_MAX_CONNECTIONS_PER_BOARD = 10;

export interface SyncConfig {
  port: number;
  internalPort: number;
  /** Address the internal control server binds to. Never `0.0.0.0` by default. */
  internalHost: string;
  /** Shared secret n4 must send as `X-Moss-Internal` on the close hook. */
  internalSecret: string;
  databaseUrl: string;
  databaseUser?: string;
  databasePassword?: string;
  jwtSecret: string;
  maxDocumentBytes: number;
  maxConnectionsPerBoard: number;
  debounceMs: number;
  maxDebounceMs: number;
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got '${raw}'`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const jwtSecret = env.JWT_SECRET;
  if (jwtSecret === undefined || jwtSecret.trim() === "") {
    throw new Error("JWT_SECRET is required");
  }
  if (Buffer.byteLength(jwtSecret, "utf8") < MIN_JWT_SECRET_BYTES) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_BYTES} bytes`);
  }

  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required");
  }

  const internalSecret = env.SYNC_INTERNAL_SECRET;
  if (internalSecret === undefined || internalSecret.trim() === "") {
    throw new Error("SYNC_INTERNAL_SECRET is required");
  }

  return {
    port: positiveInt(env.PORT, 1234, "PORT"),
    internalPort: positiveInt(env.INTERNAL_PORT, 1235, "INTERNAL_PORT"),
    internalHost: env.SYNC_INTERNAL_HOST?.trim() || "127.0.0.1",
    internalSecret,
    databaseUrl,
    databaseUser: env.DATABASE_USER,
    databasePassword: env.DATABASE_PASSWORD,
    jwtSecret,
    maxDocumentBytes: positiveInt(
      env.MAX_DOCUMENT_BYTES,
      DEFAULT_MAX_DOCUMENT_BYTES,
      "MAX_DOCUMENT_BYTES",
    ),
    maxConnectionsPerBoard: positiveInt(
      env.MAX_CONNECTIONS_PER_BOARD,
      DEFAULT_MAX_CONNECTIONS_PER_BOARD,
      "MAX_CONNECTIONS_PER_BOARD",
    ),
    debounceMs: positiveInt(env.STORE_DEBOUNCE_MS, 2000, "STORE_DEBOUNCE_MS"),
    maxDebounceMs: positiveInt(env.STORE_MAX_DEBOUNCE_MS, 10000, "STORE_MAX_DEBOUNCE_MS"),
  };
}

/**
 * node-postgres rejects the JDBC URL format Ktor uses, so strip the `jdbc:`
 * prefix. `DATABASE_USER`/`DATABASE_PASSWORD` override anything in the URL,
 * matching the Ktor service's env.
 */
export function toPgConnection(config: SyncConfig): {
  connectionString: string;
  user?: string;
  password?: string;
} {
  const connectionString = config.databaseUrl.replace(/^jdbc:/, "");
  return {
    connectionString,
    ...(config.databaseUser !== undefined && config.databaseUser !== ""
      ? { user: config.databaseUser }
      : {}),
    ...(config.databasePassword !== undefined && config.databasePassword !== ""
      ? { password: config.databasePassword }
      : {}),
  };
}
