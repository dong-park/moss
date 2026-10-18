import type { DocumentStore, Queryable } from "./documentStore.ts";
import type { McpBoardInfo, McpBoardSource } from "./mcp.ts";

/** Boards `list_boards` shows; a member of more than this sees the first ones by name and is told the list was cut. */
export const MAX_LISTED_BOARDS = 200;

/** Postgres-backed board lookups for the MCP read tools. Snapshots come from the same store the sync server uses. */
export function createPostgresBoardSource(db: Queryable, store: Pick<DocumentStore, "fetch">): McpBoardSource {
  return {
    async listBoards(userId) {
      // Members rows exist only on shared roots; boards nested inside inherit the root's role.
      // Depth stops at 32 like the membership check, so a parent cycle cannot loop.
      const result = await db.query(
        `WITH RECURSIVE tree(id, parent_id, name, role, depth) AS (
           SELECT b.id, b.parent_id, b.name, m.role, 0
             FROM members m JOIN boards b ON b.id = m.board_id WHERE m.user_id = $1
           UNION ALL
           SELECT b.id, b.parent_id, b.name, t.role, t.depth + 1
             FROM boards b JOIN tree t ON b.parent_id = t.id WHERE t.depth < 32
         )
         SELECT id, parent_id, name, role FROM (
           SELECT DISTINCT ON (id) id, parent_id, name, role FROM tree ORDER BY id, depth
         ) distinct_boards ORDER BY name, id LIMIT $2`,
        // One more than shown, so the caller can tell that the list was cut.
        [userId, MAX_LISTED_BOARDS + 1],
      );
      // The query's ORDER BY name, id is the list order; nothing is re-sorted here.
      return result.rows.map((row): McpBoardInfo => ({
        id: String(row.id),
        name: String(row.name),
        parentId: typeof row.parent_id === "string" ? row.parent_id : null,
        role: String(row.role),
      }));
    },
    fetchSnapshot: (boardId) => store.fetch(boardId),
    async fileNames(boardId) {
      const result = await db.query("SELECT id, name FROM files WHERE board_id = $1", [boardId]);
      return new Map(result.rows.map((row) => [String(row.id), String(row.name)]));
    },
  };
}
