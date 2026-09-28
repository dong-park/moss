import { jwtVerify } from "jose";

/** Must match `TokenService.ISSUER` in the Ktor server. */
export const ISSUER = "moss";
export const CLAIM_TYPE = "typ";
export const CLAIM_BOARD_ID = "boardId";
export const BOARD_TOKEN_TYPE = "board";

export interface BoardClaims {
  userId: string;
  boardId: string;
}

/** Thrown when a board token fails signature, issuer, type or claim checks. */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Board ids are opaque (web `b-…` ids too). Must match `parseBoardId` in the Ktor server. */
const BOARD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isBoardId(value: string): boolean {
  return BOARD_ID_RE.test(value);
}

/**
 * Verifies the n4 board token: HS256, issuer `moss`, `typ=board`, `sub=userId`,
 * `boardId` claim, not expired. Throws [UnauthorizedError] on any failure.
 */
export async function verifyBoardToken(token: string, secret: string): Promise<BoardClaims> {
  if (typeof token !== "string" || token.length === 0) {
    throw new UnauthorizedError("board token is missing");
  }
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new UnauthorizedError("board token is invalid");
  }

  if (payload[CLAIM_TYPE] !== BOARD_TOKEN_TYPE) {
    throw new UnauthorizedError("board token has the wrong type");
  }
  const sub = payload.sub;
  const boardId = payload[CLAIM_BOARD_ID];
  if (typeof sub !== "string" || typeof boardId !== "string") {
    throw new UnauthorizedError("board token is missing claims");
  }
  if (!isUuid(sub) || !isBoardId(boardId)) {
    throw new UnauthorizedError("board token claims are not ids");
  }
  return { userId: sub, boardId };
}
