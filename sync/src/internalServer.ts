import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isBoardId, isUuid } from "./auth.ts";

export const INTERNAL_SECRET_HEADER = "x-moss-internal";

/** Constant-time secret comparison; length mismatch short-circuits safely. */
export function secretMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}

export interface InternalServerDeps {
  port: number;
  /** Bind address; defaults to loopback so the control surface is not public. */
  host?: string;
  /** Shared secret n4 must present in `X-Moss-Internal`. */
  secret: string;
  revokeBoard: (boardId: string) => Promise<number>;
  kickMember: (boardId: string, userId: string) => Promise<number>;
}

export interface InternalServer {
  port: number;
  close(): Promise<void>;
}

const CLOSE_PATH = /^\/internal\/close\/([^/]+)$/;

/**
 * Internal control endpoint Ktor calls on revoke/kick:
 *   POST /internal/close/{boardId}            -> revoke the share (delete snapshot + drop all)
 *   POST /internal/close/{boardId}?userId={u} -> drop one member's connections
 *
 * Bound to loopback by default and gated by the shared `X-Moss-Internal`
 * secret, so holding the port on a shared network is not enough to kick
 * connections. Best-effort by design: Ktor ignores failures.
 */
export async function startInternalServer(deps: InternalServerDeps): Promise<InternalServer> {
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  async function handle(
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ): Promise<void> {
    if (request.method !== "POST") {
      response.writeHead(404);
      response.end();
      return;
    }
    const providedSecret = request.headers[INTERNAL_SECRET_HEADER];
    if (
      !secretMatches(
        deps.secret,
        Array.isArray(providedSecret) ? providedSecret[0] : providedSecret,
      )
    ) {
      response.writeHead(401);
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://internal");
    const match = CLOSE_PATH.exec(url.pathname);
    if (match === null) {
      response.writeHead(404);
      response.end();
      return;
    }
    const boardId = decodeURIComponent(match[1] as string);
    if (!isBoardId(boardId)) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("boardId is not a valid board id");
      return;
    }
    const userId = url.searchParams.get("userId") ?? undefined;
    if (userId !== undefined && !isUuid(userId)) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("userId must be a uuid");
      return;
    }
    try {
      const closed =
        userId === undefined
          ? await deps.revokeBoard(boardId)
          : await deps.kickMember(boardId, userId);
      response.writeHead(204, { "x-closed-connections": String(closed) });
      response.end();
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(deps.port, deps.host ?? "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
