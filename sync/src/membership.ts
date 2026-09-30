import { isBoardId, isUuid } from "./auth.ts";
import type { Queryable } from "./documentStore.ts";
import type { BoardExists } from "./guardedStore.ts";

/**
 * Re-checks membership on every connection (n4 review security P1, brief
 * implementation note). A board token is a 1h stateless JWT, so a removed
 * editor could otherwise reconnect with a token they kept (AC-14).
 */
export type MembershipChecker = (boardId: string, userId: string) => Promise<boolean>;

export function createPostgresMembership(db: Queryable): MembershipChecker {
  return async (boardId, userId) => {
    if (!isBoardId(boardId) || !isUuid(userId)) return false;
    const result = await db.query(
      "SELECT 1 FROM members WHERE board_id = $1 AND user_id = $2 LIMIT 1",
      [boardId, userId],
    );
    return result.rows.length > 0;
  };
}

/**
 * Board liveness, checked at store time instead of keeping a process-local
 * revocation registry: n4 deletes the `boards` row when the owner revokes a
 * share, so an absent row means "drop this snapshot" (spec §7).
 */
export function createPostgresBoardExists(db: Queryable): BoardExists {
  return async (boardId) => {
    if (!isBoardId(boardId)) return false;
    const result = await db.query("SELECT 1 FROM boards WHERE id = $1 LIMIT 1", [boardId]);
    return result.rows.length > 0;
  };
}
