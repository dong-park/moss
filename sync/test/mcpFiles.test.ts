import { describe, expect, test } from "bun:test";
import { jwtVerify } from "jose";
import { McpToolError } from "../src/mcp.ts";
import { createKtorFileUploader } from "../src/mcpFiles.ts";
import { TEST_SECRET } from "./helpers.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const FILE = { name: "고양이.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) };

describe("createKtorFileUploader", () => {
  test("posts the file to the board's files route with a short-lived access token for that user", async () => {
    let seen: { url: string; auth: string; name: string; type: string; size: number } | undefined;
    const upload = createKtorFileUploader({ ktorUrl: "http://ktor.internal:8080" }, TEST_SECRET, (async (url: URL, init: RequestInit) => {
      const file = (init.body as FormData).get("file") as File;
      seen = { url: String(url), auth: String((init.headers as Record<string, string>).authorization), name: file.name, type: file.type, size: file.size };
      return Response.json({ id: "f-1", name: file.name, size: file.size, contentType: file.type }, { status: 201 });
    }) as unknown as typeof fetch);

    const stored = await upload(USER, "b-board001", FILE);
    expect(stored).toEqual({ id: "f-1", name: "고양이.png", size: 3, contentType: "image/png" });
    expect(seen).toMatchObject({ url: "http://ktor.internal:8080/boards/b-board001/files", name: "고양이.png", type: "image/png", size: 3 });

    const token = seen!.auth.replace(/^Bearer /, "");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(TEST_SECRET), { issuer: "moss" });
    expect(payload).toMatchObject({ typ: "access", sub: USER });
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBeLessThanOrEqual(60);
  });

  test("413 carries the server's reason to the agent; 403 reads like a missing board; other failures stay internal", async () => {
    const reply = (status: number, body: unknown) =>
      createKtorFileUploader({ ktorUrl: "http://ktor.internal:8080" }, TEST_SECRET, (async () => Response.json(body, { status })) as unknown as typeof fetch);

    await expect(reply(413, { error: "quota_exceeded", message: "저장 용량(1GB)을 다 썼어요" })(USER, "b-board001", FILE)).rejects.toThrow("저장 용량(1GB)을 다 썼어요");
    await expect(reply(403, {})(USER, "b-board001", FILE)).rejects.toThrow("board not found or not accessible");
    const failure = reply(500, {})(USER, "b-board001", FILE);
    await expect(failure).rejects.toThrow("HTTP 500");
    await failure.catch((error) => expect(error).not.toBeInstanceOf(McpToolError));
  });
});
