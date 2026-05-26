import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as opfs from "@/state/db/opfs";

/**
 * jsdom은 OPFS·navigator.storage.getDirectory를 제공하지 않으므로
 * 메모리 백엔드를 직접 설치한다. 어댑터가 호출하는 API만 충실히 모방.
 */
type FakeFile = { content: Uint8Array };

function makeFakeOPFS() {
  const root = new Map<string, Map<string, FakeFile>>();

  function getDirectoryHandle(
    map: Map<string, Map<string, FakeFile>>,
    name: string,
    opts: { create?: boolean } = {},
  ) {
    let dir = map.get(name);
    if (!dir) {
      if (!opts.create) {
        const err = new Error("NotFound") as Error & { name: string };
        err.name = "NotFoundError";
        throw err;
      }
      dir = new Map();
      map.set(name, dir);
    }
    return makeDirHandle(dir, name);
  }

  function makeDirHandle(
    files: Map<string, FakeFile>,
    name: string,
  ): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      name,
      getDirectoryHandle: async (sub: string, opts?: { create?: boolean }) =>
        getDirectoryHandle(root, sub, opts),
      getFileHandle: async (
        filename: string,
        opts: { create?: boolean } = {},
      ) => {
        let file = files.get(filename);
        if (!file) {
          if (!opts.create) {
            const err = new Error("NotFound") as Error & { name: string };
            err.name = "NotFoundError";
            throw err;
          }
          file = { content: new Uint8Array() };
          files.set(filename, file);
        }
        return makeFileHandle(file, filename);
      },
      removeEntry: async (filename: string) => {
        if (!files.has(filename)) {
          const err = new Error("NotFound") as Error & { name: string };
          err.name = "NotFoundError";
          throw err;
        }
        files.delete(filename);
      },
    } as unknown as FileSystemDirectoryHandle;
  }

  function makeFileHandle(file: FakeFile, name: string): FileSystemFileHandle {
    return {
      kind: "file",
      name,
      getFile: async () => new Blob([file.content as BlobPart]),
      createWritable: async () => {
        const chunks: Uint8Array[] = [];
        return {
          write: async (data: BlobPart) => {
            const blob =
              data instanceof Blob
                ? data
                : new Blob([data as unknown as BlobPart]);
            const buf = new Uint8Array(await blob.arrayBuffer());
            chunks.push(buf);
          },
          close: async () => {
            const total = chunks.reduce((n, c) => n + c.byteLength, 0);
            const merged = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) {
              merged.set(c, off);
              off += c.byteLength;
            }
            file.content = merged;
          },
        } as unknown as FileSystemWritableFileStream;
      },
    } as unknown as FileSystemFileHandle;
  }

  return {
    storage: {
      async getDirectory() {
        return getDirectoryHandle(root, "root", { create: true });
      },
      async estimate() {
        let usage = 0;
        for (const dir of root.values()) {
          for (const f of dir.values()) usage += f.content.byteLength;
        }
        return { usage, quota: 1_000_000 };
      },
      async persist() {
        return true;
      },
      async persisted() {
        return false;
      },
    },
    reset() {
      root.clear();
    },
  };
}

let fake: ReturnType<typeof makeFakeOPFS>;
let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  fake = makeFakeOPFS();
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: fake.storage,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  } else {
    delete (navigator as { storage?: unknown }).storage;
  }
});

describe("OPFS adapter", () => {
  it("puts and gets a blob (round-trip)", async () => {
    const ref = await opfs.putBlob("hello.txt", new Blob(["hi there"]));
    expect(ref).toBe("opfs:hello.txt");
    const got = await opfs.getBlob(ref);
    expect(got).not.toBeNull();
    const text = await got!.text();
    expect(text).toBe("hi there");
  });

  it("returns null for missing blob", async () => {
    const got = await opfs.getBlob("opfs:nope.bin");
    expect(got).toBeNull();
  });

  it("deletes idempotently", async () => {
    const ref = await opfs.putBlob("x.bin", new Blob([new Uint8Array([1, 2, 3])]));
    await opfs.deleteBlob(ref);
    expect(await opfs.getBlob(ref)).toBeNull();
    // 두 번째 삭제도 throw 안 함
    await expect(opfs.deleteBlob(ref)).resolves.toBeUndefined();
  });

  it("rejects invalid filenames (paths)", async () => {
    await expect(opfs.putBlob("a/b.txt", new Blob(["x"]))).rejects.toThrow(
      /invalid OPFS filename/,
    );
    await expect(opfs.putBlob("", new Blob(["x"]))).rejects.toThrow(
      /invalid OPFS filename/,
    );
  });

  it("rejects non-opfs refs", async () => {
    await expect(opfs.getBlob("file:/tmp/x")).rejects.toThrow(/not an OPFS ref/);
  });

  it("reports quota usage shape", async () => {
    await opfs.putBlob("a.bin", new Blob([new Uint8Array(100)]));
    await opfs.putBlob("b.bin", new Blob([new Uint8Array(50)]));
    const info = await opfs.quotaUsage();
    expect(info.usage).toBeGreaterThan(0);
    expect(info.quota).toBeGreaterThan(0);
    expect(info.pct).toBeGreaterThan(0);
    expect(info.pct).toBeLessThanOrEqual(1);
  });
});

describe("makeAttachmentFilename", () => {
  it("mimeType 없으면 UUID만", () => {
    const f = opfs.makeAttachmentFilename();
    expect(f).not.toContain(".");
    expect(f.length).toBeGreaterThan(8);
  });

  it("image/png → .png", () => {
    expect(opfs.makeAttachmentFilename("image/png")).toMatch(/\.png$/);
  });

  it("audio/webm → .webm", () => {
    expect(opfs.makeAttachmentFilename("audio/webm")).toMatch(/\.webm$/);
  });

  it("application/pdf → .pdf", () => {
    expect(opfs.makeAttachmentFilename("application/pdf")).toMatch(/\.pdf$/);
  });

  it("알 수 없는 mime + 알파벳 sub → sub 확장자", () => {
    expect(opfs.makeAttachmentFilename("application/zip")).toMatch(/\.zip$/);
  });

  it("이상한 mime → 확장자 없음", () => {
    expect(opfs.makeAttachmentFilename("not-a-mime")).not.toContain(".");
  });

  it("mimeType의 charset 파라미터 무시", () => {
    expect(
      opfs.makeAttachmentFilename("image/png;charset=utf-8"),
    ).toMatch(/\.png$/);
  });
});

describe("getBlobUrl", () => {
  it("저장된 blob → object URL 반환", async () => {
    const original = (globalThis.URL as { createObjectURL?: unknown })
      .createObjectURL;
    (globalThis.URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      (b: Blob) => `blob:fake-${b.size}`;
    try {
      const ref = await opfs.putBlob("img.png", new Blob([new Uint8Array([1, 2, 3])]));
      const url = await opfs.getBlobUrl(ref);
      expect(url).toMatch(/^blob:fake-/);
    } finally {
      (globalThis.URL as { createObjectURL?: unknown }).createObjectURL = original as never;
    }
  });

  it("없는 blob → null", async () => {
    expect(await opfs.getBlobUrl("opfs:none.png")).toBeNull();
  });
});
