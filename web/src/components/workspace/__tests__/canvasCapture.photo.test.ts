import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/state/db/opfs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/state/db/opfs")>()),
  putBlob: vi.fn(async () => {}),
}));

import { storePhoto } from "@/components/workspace/canvasCapture";

function png(size = 10): File {
  return new File([new Uint8Array(size)], "a.png", { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storePhoto", () => {
  it("원본 디코드는 동시에 3장까지만 돈다", async () => {
    let running = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => release.push(r));
        running -= 1;
        return { width: 800, height: 600, close() {} };
      }),
    );

    const jobs = Array.from({ length: 8 }, () => storePhoto(png()));
    // 대기열이 찰 때까지 비동기 단계를 흘려보낸다.
    for (let n = 0; n < 50 && release.length < 3; n += 1) await Promise.resolve();
    expect(peak).toBe(3);

    // 하나씩 풀어 주며 끝까지 돌린다. 상한은 끝까지 3이다.
    while (release.length > 0 || running > 0) {
      release.shift()?.();
      for (let n = 0; n < 20; n += 1) await Promise.resolve();
    }
    const photos = await Promise.all(jobs);
    expect(peak).toBe(3);
    expect(photos.every((p) => p?.naturalW === 800 && p.naturalH === 600)).toBe(true);
  });

  it("지원하지 않는 형식은 디코드 없이 null이다", async () => {
    const bitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    const bmp = new File([new Uint8Array(4)], "a.bmp", { type: "image/bmp" });
    expect(await storePhoto(bmp)).toBeNull();
    expect(bitmap).not.toHaveBeenCalled();
  });
});
