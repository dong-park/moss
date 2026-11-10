/*
 * 시험 도구 — 메모리 OPFS. 브라우저 OPFS API만 바꾼다. purgeAttachments·deleteBlob·putBlob·getBlob은
 * 실제 함수다. removeEntry로 지운 파일을 ref 꼴("opfs:<이름>")로 removed에 적는다.
 */
type FakeFile = { content: Uint8Array };

export function installFakeOPFS(): { removed: string[] } {
  const removed: string[] = [];
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
        removed.push(`opfs:${filename}`);
        files.delete(filename);
      },
    } as unknown as FileSystemDirectoryHandle;
  }
  const storage = {
    persist: async () => true,
    persisted: async () => false,
    estimate: async () => ({ usage: 0, quota: 1_000_000 }),
    async getDirectory() {
      let rootDir = root.get("root");
      if (!rootDir) {
        rootDir = new Map<string, FakeFile>();
        root.set("root", rootDir);
      }
      return dirHandle(rootDir, "root");
    },
  };
  Object.defineProperty(navigator, "storage", { value: storage, configurable: true, writable: true });
  return { removed };
}
