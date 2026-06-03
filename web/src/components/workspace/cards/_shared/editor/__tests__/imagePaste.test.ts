import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

import { imagePasteHandler, resolveOpfsImageSrc } from "../imagePaste";
import { useToasts } from "@/state/notifications";

/* FEAT-memo-image-paste (W2) — paste/drop → OPFS → 인라인 이미지 (AC-1·3·4·5). */

/* ── 인메모리 OPFS (opfs.test.ts와 동일 패턴) ─────────────────── */
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
              data instanceof Blob ? data : new Blob([data as BlobPart]);
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
        return { usage: 0, quota: 1_000_000 };
      },
    },
  };
}

/* ── 미니 ProseMirror 스키마 (commonmark image와 동형) ────────── */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    image: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: {
        src: { default: "" },
        alt: { default: "" },
        title: { default: "" },
      },
      toDOM: (node) => ["img", node.attrs],
    },
    text: { group: "inline" },
  },
});

function makeView() {
  // EditorState.create는 빈 단락 안(pos 1)을 기본 커서로 잡는다.
  let state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph")]),
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Parameters<typeof state.apply>[0]) {
      state = state.apply(tr);
    },
    posAtCoords: () => null,
  };
  return view as unknown as EditorView & { state: EditorState };
}

function clipboardEventWith(transfer: Partial<DataTransfer>): ClipboardEvent {
  return { clipboardData: transfer } as unknown as ClipboardEvent;
}

function pngFile(name = "shot.png", bytes = [1, 2, 3, 4]): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

function imageNodeCount(view: EditorView): number {
  let n = 0;
  view.state.doc.descendants((node) => {
    if (node.type.name === "image") n += 1;
  });
  return n;
}

function firstImageSrc(view: EditorView): string | null {
  let src: string | null = null;
  view.state.doc.descendants((node) => {
    if (node.type.name === "image" && src === null) {
      src = node.attrs.src as string;
    }
  });
  return src;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let originalStorage: PropertyDescriptor | undefined;
beforeEach(() => {
  const fake = makeFakeOPFS();
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: fake.storage,
    configurable: true,
    writable: true,
  });
  // URL.createObjectURL은 jsdom에 없을 수 있어 스텁.
  (
    globalThis.URL as unknown as { createObjectURL: (b: Blob) => string }
  ).createObjectURL = (b: Blob) => `blob:fake-${b.size}`;
  useToasts.getState().clear();
});
afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  } else {
    delete (navigator as { storage?: unknown }).storage;
  }
  useToasts.getState().clear();
});

describe("resolveOpfsImageSrc (AC-4)", () => {
  it("opfs:// 참조 → blob URL", async () => {
    // 먼저 저장: imagePasteHandler 경로로 OPFS에 넣고 src를 얻는다.
    const view = makeView();
    imagePasteHandler(view, clipboardEventWith({ files: [pngFile()] as never }));
    await flush();
    const src = firstImageSrc(view);
    expect(src).toMatch(/^opfs:\/\//);
    const resolved = await resolveOpfsImageSrc(src!);
    expect(resolved).toMatch(/^blob:fake-/);
  });

  it("opfs:// 가 아니면 원본 그대로 (외부 URL 통과)", async () => {
    expect(await resolveOpfsImageSrc("https://x/y.png")).toBe(
      "https://x/y.png",
    );
  });

  it("미저장 opfs 참조 → 원본 ref 반환(렌더 폴백)", async () => {
    expect(await resolveOpfsImageSrc("opfs://missing.png")).toBe(
      "opfs://missing.png",
    );
  });
});

describe("imagePasteHandler", () => {
  it("AC-3: 텍스트만 있으면 false 반환(기본 붙여넣기 통과)", () => {
    const view = makeView();
    const consumed = imagePasteHandler(
      view,
      clipboardEventWith({ files: [] as never, items: [] as never }),
    );
    expect(consumed).toBe(false);
    expect(imageNodeCount(view)).toBe(0);
  });

  it("AC-1: 이미지 붙여넣기 → 소비(true) + OPFS 저장 + image 노드 삽입", async () => {
    const view = makeView();
    const consumed = imagePasteHandler(
      view,
      clipboardEventWith({ files: [pngFile()] as never }),
    );
    expect(consumed).toBe(true);
    await flush();
    expect(imageNodeCount(view)).toBe(1);
    expect(firstImageSrc(view)).toMatch(/^opfs:\/\/.+\.png$/);
  });

  it("clipboard items(파일)로만 노출돼도 추출한다", async () => {
    const view = makeView();
    const file = pngFile();
    const items = [
      { kind: "file", type: "image/png", getAsFile: () => file },
    ];
    const consumed = imagePasteHandler(
      view,
      clipboardEventWith({ items: items as never, files: [] as never }),
    );
    expect(consumed).toBe(true);
    await flush();
    expect(imageNodeCount(view)).toBe(1);
  });

  it("AC-5: 비지원 타입 → 경고 토스트 후 무시(노드 없음)", async () => {
    const view = makeView();
    const bmp = new File([new Uint8Array([1])], "x.bmp", {
      type: "image/bmp",
    });
    const consumed = imagePasteHandler(
      view,
      clipboardEventWith({ files: [bmp] as never }),
    );
    expect(consumed).toBe(true); // 이미지로 감지 → 소비
    await flush();
    expect(imageNodeCount(view)).toBe(0);
    const toasts = useToasts.getState().toasts;
    expect(toasts.some((t) => t.tone === "warn")).toBe(true);
  });

  it("AC-5: 용량 초과 → 경고 토스트 후 무시", async () => {
    const view = makeView();
    const big = pngFile("big.png");
    Object.defineProperty(big, "size", { value: 99 * 1024 * 1024 });
    imagePasteHandler(view, clipboardEventWith({ files: [big] as never }));
    await flush();
    expect(imageNodeCount(view)).toBe(0);
    expect(
      useToasts.getState().toasts.some((t) => t.tone === "warn"),
    ).toBe(true);
  });
});
