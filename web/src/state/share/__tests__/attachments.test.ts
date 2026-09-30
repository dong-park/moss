import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthStore, useAuth, type AuthSession } from "@/state/auth";
import { resetCollabStore } from "@/state/collab";
import { putBlob, getBlob } from "@/state/db/opfs";
import { activateBoardDoc } from "@/state/ydoc/activeDoc";
import { putNote, readDocFile, setDocFile } from "@/state/ydoc/model";
import type { Note } from "@/state/db/schema";
import type { FilesApi } from "../files";
import type { ShareApi } from "../api";
import {
  attachmentCacheRef,
  backfillBoardAttachments,
  configureAttachments,
  isSharedBoard,
  onFilesMapChange,
  resetAttachments,
  resolveAttachment,
  resolveAttachmentState,
  storeAttachment,
  uploadAttachment,
} from "../attachments";
import { configureShare, resetShareStore, useShare } from "../store";

/* ── 인메모리 OPFS (opfs.test.ts와 동일 패턴) ─────────────────── */
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

let upload: ReturnType<typeof vi.fn>;
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
  upload = vi.fn(async () => ({ id: "f-1", name: "a.png", size: 3, contentType: "image/png" }));
  download = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
  configureAttachments({ files: { upload, download } as unknown as FilesApi });
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

describe("isSharedBoard", () => {
  it("n8이 shared로 표시했거나 n7이 연결 중이면 참", () => {
    expect(isSharedBoard("b1")).toBe(false);
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    expect(isSharedBoard("b1")).toBe(true);
    expect(isSharedBoard(null)).toBe(false);
  });
});

describe("storeAttachment (작업 3)", () => {
  it("혼자 쓰는 보드는 OPFS에만 둔다 — 업로드 0건", async () => {
    const ref = await storeAttachment("b1", "a.png", new Blob([new Uint8Array([1])]));
    expect(ref).toBe("opfs:a.png");
    expect(upload).not.toHaveBeenCalled();
    expect(await getBlob(ref)).not.toBeNull();
  });

  it("공유 보드는 OPFS에 둔 뒤 업로드하고 Y.Doc files 맵에 fileId를 쓴다", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");

    const ref = await storeAttachment("b1", "a.png", new Blob([new Uint8Array([1])]));
    expect(ref).toBe("opfs:a.png");
    await uploadAttachment("b1", ref, new Blob([new Uint8Array([1])]), "a.png");

    expect(upload).toHaveBeenCalledTimes(1);
    expect(readDocFile(handle.doc, "opfs:a.png")).toBe("f-1");
  });

  it("업로드 실패면 매핑을 쓰지 않는다 — 로컬 참조는 유지", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");
    upload.mockRejectedValueOnce(new Error("413"));

    await uploadAttachment("b1", "opfs:a.png", new Blob([new Uint8Array([1])]), "a.png");

    expect(readDocFile(handle.doc, "opfs:a.png")).toBeUndefined();
  });
});

describe("resolveAttachment (작업 3·4)", () => {
  it("OPFS에 있으면 서버를 안 부른다", async () => {
    await putBlob("a.png", new Blob([new Uint8Array([1])]));
    const res = await resolveAttachment("opfs:a.png");
    expect(res.state).toBe("ready");
    expect(download).not.toHaveBeenCalled();
  });

  it("공유 보드인데 아직 fileId가 없으면 pending('올리는 중')", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    await activateBoardDoc("b1");

    const res = await resolveAttachment("opfs:missing.png");
    expect(res).toEqual({ state: "pending", url: null });
    expect(download).not.toHaveBeenCalled();
  });

  it("fileId가 있으면 내려받아 OPFS에 캐시하고 ready로 돌려준다", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");
    setDocFile(handle.doc, "opfs:a.png", "f-1");

    const res = await resolveAttachment("opfs:a.png");
    expect(res.state).toBe("ready");
    expect(download).toHaveBeenCalledWith("b1", "f-1", session.accessToken);
    // P2-1: 캐시는 보드 스코프 이름으로 저장된다.
    expect(await getBlob(attachmentCacheRef("b1", "opfs:a.png"))).not.toBeNull();
  });

  it("혼자 쓰는 보드에서 없는 참조는 missing", async () => {
    const res = await resolveAttachment("opfs:none.png");
    expect(res).toEqual({ state: "missing", url: null });
  });
});

/** P1-5: fileId가 이미 동기화됐으면 collab/소유 상태와 무관하게 내려받는다. */
describe("resolveAttachmentState — 소유 판정 (P1-5)", () => {
  it("공유 표시가 없어도 fileId가 있으면 서버에서 내려받는다", async () => {
    // useShare.shared / useCollab.boardId 둘 다 없다.
    const handle = await activateBoardDoc("b1");
    setDocFile(handle.doc, "opfs:a.png", "f-1");

    const state = await resolveAttachmentState("opfs:a.png");
    expect(state).toBe("ready");
    expect(download).toHaveBeenCalledWith("b1", "f-1", session.accessToken);
  });
});

/** P1-2: 수신 자동 다운로드 예산을 넘기면 더 받지 않는다(자원 고갈 방지). */
describe("resolveAttachmentState — 자동 다운로드 예산 (P1-2)", () => {
  it("예산(2)을 넘는 세 번째 첨부는 내려받지 않고 pending", async () => {
    configureAttachments({ maxAutoDownloadsPerBoard: 2 });
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");
    setDocFile(handle.doc, "opfs:a1.png", "f-1");
    setDocFile(handle.doc, "opfs:a2.png", "f-2");
    setDocFile(handle.doc, "opfs:a3.png", "f-3");

    expect(await resolveAttachmentState("opfs:a1.png")).toBe("ready");
    expect(await resolveAttachmentState("opfs:a2.png")).toBe("ready");
    expect(await resolveAttachmentState("opfs:a3.png")).toBe("pending");
    expect(download).toHaveBeenCalledTimes(2);
  });
});

/** P2-1: 다운로드 캐시는 보드별로 분리 — 같은 ref가 다른 파일로 치환되지 않는다. */
describe("다운로드 캐시 네임스페이스 (P2-1)", () => {
  it("보드가 다르면 같은 ref라도 다시 내려받는다", async () => {
    const h1 = await activateBoardDoc("b1");
    setDocFile(h1.doc, "opfs:a.png", "f-1");
    await resolveAttachment("opfs:a.png");

    const h2 = await activateBoardDoc("b2");
    setDocFile(h2.doc, "opfs:a.png", "f-2");
    await resolveAttachment("opfs:a.png");

    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenLastCalledWith("b2", "f-2", session.accessToken);
  });

  it("attachmentCacheRef는 보드 접두를 붙인다", () => {
    expect(attachmentCacheRef("b1", "opfs:a.png")).toBe("opfs:b1__a.png");
  });
});

/** P2-2: 상태만 조회하는 경로는 object URL을 만들지 않는다(누수 방지). */
describe("resolveAttachmentState — object URL 미생성 (P2-2)", () => {
  it("로컬 blob이 있어도 createObjectURL을 부르지 않는다", async () => {
    await putBlob("a.png", new Blob([new Uint8Array([1])]));
    const spy = vi.spyOn(URL, "createObjectURL");
    const state = await resolveAttachmentState("opfs:a.png");
    expect(state).toBe("ready");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

/** B: files 맵에 fileId가 새로 들어오면 observer가 알린다. */
describe("onFilesMapChange (B)", () => {
  it("fileId가 동기화되면 콜백이 불리고, 해제하면 안 불린다", async () => {
    const handle = await activateBoardDoc("b1");
    const cb = vi.fn();
    const unsubscribe = onFilesMapChange(cb);

    setDocFile(handle.doc, "opfs:a.png", "f-1");
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    setDocFile(handle.doc, "opfs:b.png", "f-2");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

/** P1-4/A: 공유 시작 시 기존 로컬 첨부를 소급 업로드한다. */
describe("backfillBoardAttachments (A)", () => {
  function noteWith(content: string): Note {
    return {
      id: `n-${Math.random().toString(36).slice(2)}`,
      boardId: "b1",
      kind: "text",
      x: 0,
      y: 0,
      width: 720,
      rotation: 0,
      content,
      aiOptOut: false,
      createdAt: 0,
      updatedAt: 0,
      lastVisitedAt: 0,
    };
  }

  it("본문의 로컬 참조를 업로드하고 files 맵에 fileId를 적는다", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");
    await putBlob("a.png", new Blob([new Uint8Array([1])]));
    putNote(handle.doc, noteWith("![](opfs://a.png)"));

    await backfillBoardAttachments("b1");

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith("b1", expect.any(Blob), "a.png", session.accessToken);
    expect(readDocFile(handle.doc, "opfs:a.png")).toBe("f-1");
  });

  it("이미 fileId가 있는 참조는 다시 올리지 않는다", async () => {
    useShare.setState({ byBoard: { b1: { status: "shared", inviteToken: null } } });
    const handle = await activateBoardDoc("b1");
    await putBlob("a.png", new Blob([new Uint8Array([1])]));
    putNote(handle.doc, noteWith("![](opfs://a.png)"));
    setDocFile(handle.doc, "opfs:a.png", "already");

    await backfillBoardAttachments("b1");
    expect(upload).not.toHaveBeenCalled();
  });
});

/** A 배선: startShare 성공 뒤 onBoardShared로 백필을 트리거한다. */
describe("startShare → 백필 트리거 (A)", () => {
  it("공유가 성공하면 onBoardShared(boardId)를 부른다", async () => {
    const onBoardShared = vi.fn();
    const api: ShareApi = {
      share: vi.fn(async () => ({
        id: "b1",
        name: "보드",
        role: "owner" as const,
        ownerName: "동환",
      })),
      boardToken: vi.fn(async () => ({ boardToken: "bt", expiresInSeconds: 3600 })),
      members: vi.fn(async () => []),
      unshare: vi.fn(async () => undefined),
      reissueInvite: vi.fn(async () => "tok"),
      removeMember: vi.fn(async () => undefined),
      myBoards: vi.fn(async () => []),
    };
    configureShare({ api, onBoardShared });

    await useShare.getState().startShare("b1", "보드");
    expect(onBoardShared).toHaveBeenCalledWith("b1");
  });
});
