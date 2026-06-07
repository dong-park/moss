import { describe, test, expect } from "bun:test";
import { writeFile, rm } from "node:fs/promises";
import { resolveImageInput, resolveMediaInput } from "./image.ts";

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

describe("resolveMediaInput", () => {
  test("audio: audio/* 허용", async () => {
    const r = await resolveMediaInput({ dataBase64: "AAAA", mimeType: "audio/mpeg" }, "audio");
    expect(r.mimeType).toBe("audio/mpeg");
  });

  test("audio: 비-오디오 mime → throw", async () => {
    await expect(
      resolveMediaInput({ dataBase64: PNG_B64, mimeType: "image/png" }, "audio"),
    ).rejects.toThrow("오디오 MIME");
  });

  test("audio: .mp3 path → audio/mpeg 추론", async () => {
    const p = "/tmp/moss-mcp-audio-test.mp3";
    await writeFile(p, Buffer.from("AAAA", "base64"));
    const r = await resolveMediaInput({ path: p }, "audio");
    expect(r.mimeType).toBe("audio/mpeg");
    await rm(p);
  });

  test("any(file): mimeType 미상이면 application/octet-stream", async () => {
    const r = await resolveMediaInput({ dataBase64: "AAAA" }, "any");
    expect(r.mimeType).toBe("application/octet-stream");
  });

  test("any(file): .pdf path → application/pdf, 확장자 미상 path → octet-stream", async () => {
    const pdf = "/tmp/moss-mcp-file-test.pdf";
    await writeFile(pdf, Buffer.from("AAAA", "base64"));
    expect((await resolveMediaInput({ path: pdf }, "any")).mimeType).toBe("application/pdf");
    await rm(pdf);
    const bin = "/tmp/moss-mcp-file-test.unknownext";
    await writeFile(bin, Buffer.from("AAAA", "base64"));
    expect((await resolveMediaInput({ path: bin }, "any")).mimeType).toBe(
      "application/octet-stream",
    );
    await rm(bin);
  });
});
