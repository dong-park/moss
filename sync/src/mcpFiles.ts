import { SignJWT } from "jose";
import { CLAIM_TYPE, ISSUER } from "./auth.ts";
import { McpToolError, type McpEndpointConfig, type McpFileUploader, type McpUploadedFile } from "./mcp.ts";

/** Attachment upload for the MCP write tools (RM-6): the file goes to the Ktor server, which owns file storage and quotas. */

const ACCESS_TOKEN_TYPE = "access";
/** The token only has to outlive one upload request. */
const ACCESS_TOKEN_TTL_SECONDS = 60;
const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Uploads through `POST /boards/{id}/files` as the member who called the tool. Ktor accepts only its own
 * web-session access token on that route, and sync already shares `JWT_SECRET` with it for board tokens,
 * so each upload gets a 60-second access token for exactly that user. Ktor still checks board membership
 * and the storage quotas itself.
 */
export function createKtorFileUploader(
  config: Pick<McpEndpointConfig, "ktorUrl">,
  jwtSecret: string,
  fetchImpl: typeof fetch = fetch,
): McpFileUploader {
  const key = new TextEncoder().encode(jwtSecret);
  return async (userId, boardId, file): Promise<McpUploadedFile> => {
    const token = await new SignJWT({ [CLAIM_TYPE]: ACCESS_TOKEN_TYPE })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(key);

    const form = new FormData();
    form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
    const response = await fetchImpl(new URL(`/boards/${encodeURIComponent(boardId)}/files`, config.ktorUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });

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
  };
}
