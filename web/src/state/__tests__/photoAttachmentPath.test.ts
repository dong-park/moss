import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB, type Note } from "@/state/db/schema";
import { deleteBlob, getBlob, putBlob } from "@/state/db/opfs";
import { activateBoardDoc } from "@/state/ydoc/activeDoc";
import { putNote, readNotes } from "@/state/ydoc/model";
import { __resetBoardDocsForTest } from "@/state/workspace";
import { resolveAttachment } from "@/state/share/attachments";
import { exportMossBundle } from "@/state/export/mossBundleExport";
import { importMossBundle } from "@/state/export/mossBundleImport";
import { useStorage } from "@/state/storage";

/* ─────────────────────────────────────────────────────────────
 * A0 실험 — 사진 카드의 `attachmentRef` 경로 실사용 검증.
 *
 * 사진 카드에는 content 마크다운이 없다(캡션 평문). 이미지 블록이 본문에
 * `opfs://`를 심던 경로를 거치지 않으므로, 다음 세 가지가 attachmentRef만으로
 * 성립하는지 먼저 확인한다(성공 기준 12·13·14의 전제):
 *   ① Y.Doc에서 읽은 photo 노트의 ref로 resolveAttachment가 ready
 *   ② moss 번들 내보내기→가져오기 뒤 blob·ref 유지
 *   ③ purgeAttachments가 blob을 지운다
 *
 * 종류는 기존 text로 둔다 — 사진 kind가 아직 허용 목록에 없어도 attachmentRef
 * 경로 자체가 성립하는지 확인하는 실험이다. 사진 kind의 가져오기 허용은 A 작업.
 * ───────────────────────────────────────────────────────────── */

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

function photoNote(over: Partial<Note> = {}): Note {
  return {
    id: "p1",
    boardId: "b1",
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    height: 180,
    rotation: 0,
    content: "제주 바다",
    attachmentRef: "opfs:x.png",
    mediaType: "image/png",
    aiOptOut: false,
    createdAt: 1,
    updatedAt: 1,
    lastVisitedAt: 1,
    ...over,
  };
}

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: makeFakeOPFS(),
    configurable: true,
    writable: true,
  });
  (globalThis.URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) =>
    `blob:fake-${b.size}`;
  await resetDB();
  await __resetBoardDocsForTest();
  useStorage.setState({ initialized: false, settings: null, quota: null });
});

afterEach(async () => {
  await __resetBoardDocsForTest();
  await resetDB();
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
  else delete (navigator as { storage?: unknown }).storage;
});

describe("A0 — attachmentRef 경로", () => {
  it("Y.Doc에서 읽은 photo의 ref로 resolveAttachment가 ready", async () => {
    await putBlob("x.png", new Blob([new Uint8Array([1, 2, 3])]));
    const handle = await activateBoardDoc("b1");
    putNote(handle.doc, photoNote());

    const shared = readNotes(handle.doc).find((n) => n.id === "p1");
    expect(shared?.attachmentRef).toBe("opfs:x.png");

    const res = await resolveAttachment(shared!.attachmentRef!);
    expect(res.state).toBe("ready");
    expect(res.url).toBeTruthy();
  });

  it("moss 번들 내보내기→가져오기 뒤 blob·ref 유지", async () => {
    const db = getDB();
    await db.open();
    await db.boards.put({
      id: "b1",
      name: "B",
      isSystem: false,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
    });
    await db.notes.put(photoNote());
    await putBlob("x.png", new Blob([new Uint8Array([9, 8, 7, 6])]));

    const exported = await exportMossBundle({ scope: "all" });
    expect(exported).not.toBeNull();

    await resetDB();
    useStorage.setState({ initialized: false, settings: null, quota: null });
    await importMossBundle(exported!.blob, "overwrite");

    const restored = await getDB().notes.get("p1");
    expect(restored?.attachmentRef).toBe("opfs:x.png");
    expect(restored?.content).toBe("제주 바다");
    expect(await getBlob("opfs:x.png")).not.toBeNull();
  });

  it("purgeAttachments가 사진 blob을 지운다", async () => {
    await putBlob("x.png", new Blob([new Uint8Array([1])]));
    expect(await getBlob("opfs:x.png")).not.toBeNull();

    await useStorage.getState().purgeAttachments([photoNote()]);
    expect(await getBlob("opfs:x.png")).toBeNull();
  });
});

/* ③의 대칭 — deleteBlob이 직접 동작함을 못 박는다(테스트 격리 fake OPFS 확인). */
describe("A0 — fake OPFS 기본 동작", () => {
  it("deleteBlob 후 getBlob은 null", async () => {
    await putBlob("y.png", new Blob([new Uint8Array([1])]));
    await deleteBlob("opfs:y.png");
    expect(await getBlob("opfs:y.png")).toBeNull();
  });
});
