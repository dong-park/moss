import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthStore, useAuth, type AuthSession } from "@/state/auth";
import { resetCollabStore } from "@/state/collab";
import { activateBoardDoc } from "@/state/ydoc/activeDoc";
import { setDocFile } from "@/state/ydoc/model";
import {
  configureAttachments,
  resetAttachments,
} from "@/state/share/attachments";
import { resetShareStore, useShare } from "@/state/share/store";
import type { FilesApi } from "@/state/share/files";
import { resolveBlobUrl } from "../blockView";

/* n10w P1-3 — pending/missing을 null로 캐시하지 않아야 fileId가 나중에
 * 동기화됐을 때 재시도가 실제 첨부로 해석된다. */

type FakeFile = { content: Uint8Array };
function makeFakeOPFS() {
  const root = new Map<string, Map<string, FakeFile>>();
  function dirHandle(files: Map<string, FakeFile>, name: string): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      name,
      getDirectoryHandle: async (sub: string, opts?: { create?: boolean }) => {
        let dir = root.get(sub);
        if (!dir) {
          if (!opts?.create) throw Object.assign(new Error("nf"), { name: "NotFoundError" });
          dir = new Map();
          root.set(sub, dir);
        }
        return dirHandle(dir, sub);
      },
      getFileHandle: async (filename: string, opts: { create?: boolean } = {}) => {
        let file = files.get(filename);
        if (!file) {
          if (!opts.create) throw Object.assign(new Error("nf"), { name: "NotFoundError" });
          file = { content: new Uint8Array() };
          files.set(filename, file);
        }
        return {
          kind: "file",
          name: filename,
          getFile: async () => new Blob([file!.content as BlobPart]),
          createWritable: async () => {
            const chunks: Uint8Array[] = [];
            return {
              write: async (data: BlobPart) => {
                const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
                chunks.push(new Uint8Array(await blob.arrayBuffer()));
              },
              close: async () => {
                const total = chunks.reduce((n, c) => n + c.byteLength, 0);
                const merged = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                  merged.set(c, off);
                  off += c.byteLength;
                }
                file!.content = merged;
              },
            };
          },
        } as unknown as FileSystemFileHandle;
      },
      removeEntry: async (filename: string) => {
        files.delete(filename);
      },
    } as unknown as FileSystemDirectoryHandle;
  }
  return {
    async getDirectory() {
      let rootDir = root.get("root");
      if (!rootDir) {
        rootDir = new Map<string, FakeFile>();
        root.set("root", rootDir);
      }
      return dirHandle(rootDir, "root");
    },
    async estimate() {
      return { usage: 0, quota: 1_000_000 };
    },
  };
}

function makeToken(): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc({ exp: 9_999_999_999 })}.sig`;
}

const session: AuthSession = {
  accessToken: makeToken(),
  refreshToken: makeToken(),
  user: { id: "u1", name: "동환", avatar: null },
};

let download: ReturnType<typeof vi.fn>;
let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: makeFakeOPFS(),
    configurable: true,
    writable: true,
  });
  (globalThis.URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) =>
    `blob:fake-${b.size}`;
  download = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
  configureAttachments({ files: { upload: vi.fn(), download } as unknown as FilesApi });
  resetShareStore();
  resetCollabStore();
  resetAuthStore();
  useAuth.setState({
    session,
    user: session.user,
    status: "authenticated",
    hydrated: true,
    hydrating: false,
  });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
  else delete (navigator as { storage?: unknown }).storage;
  resetAttachments();
  resetShareStore();
  resetCollabStore();
  resetAuthStore();
});

describe("resolveBlobUrl — null 캐시 금지 (P1-3)", () => {
  it("fileId가 나중에 동기화되면 재시도가 실제 첨부로 해석된다", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");

    // 아직 업로드 전 — 올리는 중이라 null.
    expect(await resolveBlobUrl("opfs:a.png")).toBeNull();
    expect(download).not.toHaveBeenCalled();

    // 업로더의 fileId가 Yjs로 동기화됐다.
    setDocFile(handle.doc, "opfs:a.png", "f-1");

    const url = await resolveBlobUrl("opfs:a.png");
    expect(download).toHaveBeenCalledTimes(1);
    expect(url).toMatch(/^blob:/);
  });
});
