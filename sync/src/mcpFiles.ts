import { McpToolError, type McpCaller, type McpEndpointConfig, type McpFileStore, type McpUploadedFile } from "./mcp.ts";

/**
 * Attachment storage for the MCP write tools (RM-6). Files live on the Ktor server, which owns storage and quotas.
 *
 * Sync calls Ktor's internal MCP file routes with the shared internal secret, naming the user and the connector
 * grant the tool call came from. Ktor checks that the grant is still live and belongs to that user, then board
 * membership and quotas, and logs the upload as an MCP upload. The agent's own token never leaves this endpoint
 * (the MCP authorization spec forbids passing it to another service), and no web session token is made here.
 */

const UPLOAD_TIMEOUT_MS = 30_000;
const DELETE_TIMEOUT_MS = 10_000;

/** Shown when Ktor no longer accepts the connector grant, so the agent knows retrying will not help. */
export const RECONNECT_MESSAGE =
  "이 커넥터 연결이 끊겨 있어 파일을 올리지 못했어요. moss에서 커넥터를 다시 연결한 뒤 시도해 주세요.";

export function createKtorFileStore(
  config: Pick<McpEndpointConfig, "ktorUrl">,
  internalSecret: string,
  fetchImpl: typeof fetch = fetch,
): McpFileStore {
  const route = (boardId: string, fileId?: string) =>
    new URL(
      `/internal/mcp/boards/${encodeURIComponent(boardId)}/files` + (fileId === undefined ? "" : "/" + encodeURIComponent(fileId)),
      config.ktorUrl,
    );

  const headers = (caller: McpCaller): Record<string, string> => {
    // Ktor would refuse a call without a grant anyway; stop here with the same advice.
    if (caller.grantId === null) throw new McpToolError(RECONNECT_MESSAGE);
    return { "x-moss-internal": internalSecret, "x-moss-user": caller.userId, "x-moss-grant": caller.grantId };
  };

  return {
    async upload(caller, boardId, file): Promise<McpUploadedFile> {
      const form = new FormData();
      form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
      const response = await fetchImpl(route(boardId), {
        method: "POST",
        headers: headers(caller),
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });

      if (response.status === 401) throw new McpToolError(RECONNECT_MESSAGE);
      if (response.status === 413) {
        // Ktor words the reason: board size, one file's size, or the account's storage quota.
        const body = (await response.json().catch(() => ({}))) as { message?: unknown };
        throw new McpToolError(typeof body.message === "string" ? body.message : "file is too large");
      }
      if (response.status === 403 || response.status === 404) throw new McpToolError("board not found or not accessible");
      if (!response.ok) throw new Error(`file upload failed with HTTP ${response.status}`);

      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.id !== "string") throw new Error("file upload reply has no id");
      return {
        id: body.id,
        name: typeof body.name === "string" ? body.name : file.name,
        size: typeof body.size === "number" ? body.size : file.bytes.byteLength,
        contentType: typeof body.contentType === "string" ? body.contentType : file.type,
      };
    },

    async remove(caller, boardId, fileId) {
      const response = await fetchImpl(route(boardId, fileId), {
        method: "DELETE",
        headers: headers(caller),
        signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
      });
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`file delete failed with HTTP ${response.status}`);
    },
  };
}
