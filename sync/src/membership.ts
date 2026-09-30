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
    // 공유 보드 안 파일함은 부모 체인의 멤버십을 물려받는다 (V6 boards.parent_id).
    // 깊이 32에서 끊어 사이클이 생겨도 멈춘다 — server roleOf와 같은 상한이다.
    const result = await db.query(
      `WITH RECURSIVE chain(id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM boards WHERE id = $1
         UNION ALL
         SELECT b.id, b.parent_id, c.depth + 1 FROM boards b
           JOIN chain c ON b.id = c.parent_id WHERE c.depth < 32
       )
       SELECT 1 FROM members m JOIN chain c ON m.board_id = c.id
       WHERE m.user_id = $2 LIMIT 1`,
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
