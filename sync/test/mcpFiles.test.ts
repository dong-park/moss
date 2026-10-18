import { describe, expect, test } from "bun:test";
import { McpToolError } from "../src/mcp.ts";
import { RECONNECT_MESSAGE, createKtorFileStore } from "../src/mcpFiles.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const GRANT = "33333333-3333-4333-8333-333333333333";
const CALLER = { userId: USER, clientId: "claude-test", grantId: GRANT };
const FILE = { name: "고양이.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) };
const KTOR = { ktorUrl: "http://ktor.internal:8080" };

const replying = (status: number, body?: unknown) =>
  createKtorFileStore(KTOR, "internal-secret", (async () =>
    body === undefined ? new Response(null, { status }) : Response.json(body, { status })) as unknown as typeof fetch);

describe("createKtorFileStore", () => {
  test("uploads to the internal MCP route with the internal secret, the user and the grant, and no bearer token", async () => {
    let seen: { url: string; method: string; headers: Record<string, string>; name: string; type: string; size: number } | undefined;
    const files = createKtorFileStore(KTOR, "internal-secret", (async (url: URL, init: RequestInit) => {
      const file = (init.body as FormData).get("file") as File;
      seen = { url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, name: file.name, type: file.type, size: file.size };
      return Response.json({ id: "f-1", name: file.name, size: file.size, contentType: file.type }, { status: 201 });
    }) as unknown as typeof fetch);

    const stored = await files.upload(CALLER, "b-board001", FILE);
    expect(stored).toEqual({ id: "f-1", name: "고양이.png", size: 3, contentType: "image/png" });
    expect(seen).toMatchObject({ url: "http://ktor.internal:8080/internal/mcp/boards/b-board001/files", method: "POST", name: "고양이.png", type: "image/png", size: 3 });
    expect(seen!.headers).toEqual({ "x-moss-internal": "internal-secret", "x-moss-user": USER, "x-moss-grant": GRANT });
  });

  test("401 tells the agent to reconnect; 413 carries the server's reason; 403 reads like a missing board; other failures stay internal", async () => {
    await expect(replying(401, { error: "unauthorized" }).upload(CALLER, "b-board001", FILE)).rejects.toThrow(RECONNECT_MESSAGE);
    await expect(replying(413, { error: "quota_exceeded", message: "저장 용량(1GB)을 다 썼어요" }).upload(CALLER, "b-board001", FILE)).rejects.toThrow("저장 용량(1GB)을 다 썼어요");
    await expect(replying(403, {}).upload(CALLER, "b-board001", FILE)).rejects.toThrow("board not found or not accessible");
    const failure = replying(500, {}).upload(CALLER, "b-board001", FILE);
    await expect(failure).rejects.toThrow("HTTP 500");
    await failure.catch((error) => expect(error).not.toBeInstanceOf(McpToolError));
  });

  test("a caller without a grant is refused before any request", async () => {
    let calls = 0;
    const files = createKtorFileStore(KTOR, "internal-secret", (async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch);
    await expect(files.upload({ ...CALLER, grantId: null }, "b-board001", FILE)).rejects.toThrow(RECONNECT_MESSAGE);
    expect(calls).toBe(0);
  });

  test("remove deletes the stored file through the internal route; an already missing file counts as removed", async () => {
    let seen: { url: string; method: string } | undefined;
    const files = createKtorFileStore(KTOR, "internal-secret", (async (url: URL, init: RequestInit) => {
      seen = { url: String(url), method: String(init.method) };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch);
    await files.remove(CALLER, "b-board001", "f-1");
    expect(seen).toEqual({ url: "http://ktor.internal:8080/internal/mcp/boards/b-board001/files/f-1", method: "DELETE" });
    await replying(404, { error: "not_found" }).remove(CALLER, "b-board001", "f-1");
    await expect(replying(500).remove(CALLER, "b-board001", "f-1")).rejects.toThrow("HTTP 500");
  });
});
