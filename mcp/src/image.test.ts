import { describe, test, expect } from "bun:test";
import { writeFile, rm } from "node:fs/promises";
import { resolveImageInput } from "./image.ts";

// 1x1 투명 PNG.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("resolveImageInput", () => {
  test("path → base64 + 확장자로 mime 추론", async () => {
    const p = "/tmp/moss-mcp-img-test.png";
    await writeFile(p, Buffer.from(PNG_B64, "base64"));
    const r = await resolveImageInput({ path: p });
    expect(r.mimeType).toBe("image/png");
    expect(r.dataBase64).toBe(PNG_B64);
    expect(r.bytes).toBeGreaterThan(0);
    await rm(p);
  });

  test("dataBase64 + mimeType", async () => {
    const r = await resolveImageInput({ dataBase64: PNG_B64, mimeType: "image/png" });
    expect(r.mimeType).toBe("image/png");
    expect(r.dataBase64).toBe(PNG_B64);
  });

  test("dataBase64인데 mimeType 없음 → throw", async () => {
    await expect(resolveImageInput({ dataBase64: PNG_B64 })).rejects.toThrow("mimeType");
  });

  test("이미지 아닌 mime → throw", async () => {
    await expect(
      resolveImageInput({ dataBase64: PNG_B64, mimeType: "text/plain" }),
    ).rejects.toThrow("이미지 MIME");
  });

  test("path/dataBase64 둘 다 없음 → throw", async () => {
    await expect(resolveImageInput({})).rejects.toThrow("필요");
  });

  test("확장자로 mime 추론 불가 → throw", async () => {
    const p = "/tmp/moss-mcp-img-test.xyz";
    await writeFile(p, Buffer.from(PNG_B64, "base64"));
    await expect(resolveImageInput({ path: p })).rejects.toThrow("추론");
    await rm(p);
  });
});
