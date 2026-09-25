import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import { countBlocks, parseBlock } from "@/state/blocks";

/* FEAT-sticky-redesign n6 — 캔버스 붙여넣기·드롭이 블록 든 text 메모를 만든다
 * (spec AC-6·AC-7). image·link·file 종류 행은 늘지 않는다. */

const CANVAS_W = 800;
const CANVAS_H = 600;

let originalGBCR: typeof Element.prototype.getBoundingClientRect;

/* ── 인메모리 OPFS (imagePaste.test.ts와 동일 패턴) ───────────── */
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

let originalStorage: PropertyDescriptor | undefined;

beforeAll(() => {
  // jsdom의 getBoundingClientRect는 항상 0을 반환한다 — Canvas.virtualization.test와 동일 패치.
  originalGBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: CANVAS_W,
      bottom: CANVAS_H,
      width: CANVAS_W,
      height: CANVAS_H,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGBCR;
});

beforeEach(() => {
  const fake = makeFakeOPFS();
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: fake.storage,
    configurable: true,
    writable: true,
  });
  (
    globalThis.URL as unknown as { createObjectURL: (b: Blob) => string }
  ).createObjectURL = (b: Blob) => `blob:fake-${b.size}`;
  useToasts.setState({ toasts: [] });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { x: 0, y: 0, scale: 1 },
    currentBoardId: "test-board",
  });
});

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  } else {
    delete (navigator as { storage?: unknown }).storage;
  }
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { x: 0, y: 0, scale: 1 },
    currentBoardId: SYSTEM_BOARD_ID,
  });
  useToasts.setState({ toasts: [] });
});

function mount() {
  return render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function pngFile(name = "shot.png", bytes = [1, 2, 3, 4]): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

function pdfFile(name = "doc.pdf", bytes = [1, 2, 3, 4]): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

/** jsdom ClipboardEvent에는 clipboardData 세터가 없어 defineProperty로 주입한다. */
function pasteEventWith(transfer: Partial<DataTransfer>): void {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: transfer });
  window.dispatchEvent(event);
}

function dropFilesOn(el: Element, files: File[]) {
  const dataTransfer = {
    files,
    types: ["Files"],
    items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })),
  } as unknown as DataTransfer;
  fireEvent.drop(el, { dataTransfer, clientX: 100, clientY: 100 });
}

function cardsByKind(kind: string): Card[] {
  return useWorkspace.getState().cards.filter((c) => c.kind === kind);
}

describe("FEAT-sticky-redesign n6 · 캔버스 붙여넣기", () => {
  it("AC-6: PNG 붙여넣기 → notes(text) +1, 이미지 블록 본문, image 행 +0", async () => {
    mount();
    expect(cardsByKind("text")).toHaveLength(0);

    pasteEventWith({ files: [pngFile()] as never, getData: () => "" });
    await flush();

    expect(cardsByKind("text")).toHaveLength(1);
    expect(cardsByKind("image")).toHaveLength(0);
    const card = cardsByKind("text")[0];
    const counts = countBlocks(card.content);
    expect(counts.image).toBe(1);
    expect(parseBlock(card.content.trim())?.type).toBe("image");
  });

  it("AC-7: URL 붙여넣기 → text 메모 + 링크 블록, link 행 +0", async () => {
    mount();
    pasteEventWith({
      files: [] as never,
      items: [] as never,
      getData: () => "https://example.com/page",
    });
    await flush();

    expect(cardsByKind("link")).toHaveLength(0);
    expect(cardsByKind("text")).toHaveLength(1);
    const card = cardsByKind("text")[0];
    const block = parseBlock(card.content.trim());
    expect(block?.type).toBe("link");
    if (block?.type === "link") expect(block.url).toBe("https://example.com/page");
  });

  it("입력칸에 포커스가 있으면 붙여넣기를 무시한다", async () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    pasteEventWith({ files: [pngFile()] as never, getData: () => "" });
    await flush();

    expect(useWorkspace.getState().cards).toHaveLength(0);
    input.remove();
  });
});

describe("FEAT-sticky-redesign n6 · 캔버스 파일 드롭", () => {
  it("PDF 드롭 → 파일 블록 든 text 메모, file 행 +0", async () => {
    const { container } = mount();
    const root = container.querySelector("[data-canvas-root='true']")!;

    dropFilesOn(root, [pdfFile()]);
    await flush();

    expect(cardsByKind("file")).toHaveLength(0);
    expect(cardsByKind("text")).toHaveLength(1);
    const block = parseBlock(cardsByKind("text")[0].content.trim());
    expect(block?.type).toBe("file");
    if (block?.type === "file") expect(block.filename).toBe("doc.pdf");
  });

  it("이미지 파일 드롭 → 이미지 블록", async () => {
    const { container } = mount();
    const root = container.querySelector("[data-canvas-root='true']")!;

    dropFilesOn(root, [pngFile()]);
    await flush();

    const block = parseBlock(cardsByKind("text")[0].content.trim());
    expect(block?.type).toBe("image");
  });

  it("21개 드롭 → 20개만 생성 + 토스트", async () => {
    const { container } = mount();
    const root = container.querySelector("[data-canvas-root='true']")!;

    const files = Array.from({ length: 21 }, (_, i) => pdfFile(`f${i}.pdf`));
    dropFilesOn(root, files);
    await flush();

    expect(cardsByKind("text")).toHaveLength(20);
    expect(useToasts.getState().toasts.some((t) => t.tone === "warn")).toBe(true);
  });

  it("입력칸에 포커스가 있으면 드롭을 무시한다", async () => {
    const { container } = mount();
    const root = container.querySelector("[data-canvas-root='true']")!;
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    dropFilesOn(root, [pdfFile()]);
    await flush();

    expect(useWorkspace.getState().cards).toHaveLength(0);
    input.remove();
  });

  // FEAT-text-tool AC-2: T 배치 모드에서 캔버스 클릭 → 클릭 지점(왼쪽 위)에 textbox, 모드 해제.
  it("배치 모드 + 캔버스 클릭 → 클릭 지점에 textbox 생성·모드 해제", async () => {
    const { container } = mount();
    const root = container.querySelector("[data-canvas-root='true']")!;

    act(() => useWorkspace.getState().armTextPlacement());
    fireEvent.mouseDown(root, { clientX: 200, clientY: 150, button: 0 });
    await flush();

    const state = useWorkspace.getState();
    const card = state.cards.find((c) => c.kind === "textbox");
    expect(card).toBeDefined();
    expect(card!.x).toBe(200);
    expect(card!.y).toBe(150);
    expect(state.textPlacementArmed).toBe(false);
    expect(state.editingId).toBe(card!.id);
  });

  // 무소속 토스트를 Canvas.tsx에서 주석 처리해 숨김(2026-09-22 사용자 결정).
  // 토스트를 되살릴 때 이 skip도 함께 푼다.
  it.skip("시스템 보드에 드롭하면 새 보드 승격 토스트를 띄운다", async () => {
    useWorkspace.setState({ currentBoardId: SYSTEM_BOARD_ID });
    const { container } = mount();
    const root = container.querySelector("[data-canvas-root='true']")!;

    dropFilesOn(root, [pdfFile()]);
    await flush();

    expect(useWorkspace.getState().cards).toHaveLength(1);
    expect(
      useToasts.getState().toasts.some((t) => t.tone === "calm" && t.action),
    ).toBe(true);
  });
});
