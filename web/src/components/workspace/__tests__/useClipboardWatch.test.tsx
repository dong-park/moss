import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useClipboardWatch } from "@/components/workspace/useClipboardWatch";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import * as opfsModule from "@/state/db/opfs";

let originalStorage: PropertyDescriptor | undefined;
let originalClipboard: PropertyDescriptor | undefined;

function Mount({ kind, cardId }: { kind: "image" | "link"; cardId: string }) {
  useClipboardWatch(kind, cardId);
  return null;
}

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    pendingAIGate: null,
    lastToolId: "text",
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

function installClipboard(value: Partial<Clipboard>) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("FEAT-capture AC-5: useClipboardWatch", () => {
  it("link: 클립보드 URL → setContent에 serialize된 link JSON 저장", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("link", 0, 0);
    await new Promise((r) => setTimeout(r, 5));

    installClipboard({
      readText: vi.fn(async () => "https://example.com/article"),
    });

    render(<Mount kind="link" cardId={id} />);
    await new Promise((r) => setTimeout(r, 20));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    const parsed = JSON.parse(card!.content);
    expect(parsed.url).toBe("https://example.com/article");
  });

  it("link: 클립보드가 URL 아니면 카드 빈 채로 유지", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("link", 0, 0);
    await new Promise((r) => setTimeout(r, 5));

    installClipboard({
      readText: vi.fn(async () => "그냥 텍스트 메모"),
    });

    render(<Mount kind="link" cardId={id} />);
    await new Promise((r) => setTimeout(r, 10));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card!.content).toBe("");
  });

  it("link: 권한 거부 (NotAllowedError) → setContent 호출 안 함", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("link", 0, 0);
    await new Promise((r) => setTimeout(r, 5));

    const readText = vi.fn(async () => {
      const err = new Error("denied") as Error & { name: string };
      err.name = "NotAllowedError";
      throw err;
    });
    installClipboard({ readText });

    render(<Mount kind="link" cardId={id} />);
    await new Promise((r) => setTimeout(r, 10));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card!.content).toBe("");
  });

  it("link: navigator.clipboard 미존재 → 무동작", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("link", 0, 0);
    await new Promise((r) => setTimeout(r, 5));

    delete (navigator as { clipboard?: unknown }).clipboard;

    render(<Mount kind="link" cardId={id} />);
    await new Promise((r) => setTimeout(r, 10));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card!.content).toBe("");
  });

  it("link: 카드에 content 이미 있으면 덮어쓰지 않음", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("link", 0, 0);
    await new Promise((r) => setTimeout(r, 5));
    // 사용자가 미리 입력
    useWorkspace.getState().setContent(id, '{"url":"https://manual.com"}');

    installClipboard({
      readText: vi.fn(async () => "https://clipboard.com/x"),
    });

    render(<Mount kind="link" cardId={id} />);
    await new Promise((r) => setTimeout(r, 10));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card!.content).toBe('{"url":"https://manual.com"}');
  });

  it("image: ClipboardItem에 image/* 있으면 putBlob + setAttachment", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("image", 0, 0);
    await new Promise((r) => setTimeout(r, 5));

    const putBlobSpy = vi
      .spyOn(opfsModule, "putBlob")
      .mockResolvedValue("opfs:fake.png");

    const fakeBlob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/png",
    });
    const item = {
      types: ["image/png"],
      getType: vi.fn(async () => fakeBlob),
    } as unknown as ClipboardItem;

    installClipboard({
      read: vi.fn(async () => [item]),
    } as Partial<Clipboard>);

    render(<Mount kind="image" cardId={id} />);
    await new Promise((r) => setTimeout(r, 30));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card!.attachmentRef).toBe("opfs:fake.png");
    expect(card!.mediaType).toBe("image/png");
    expect(putBlobSpy).toHaveBeenCalled();
  });

  it("image: 권한 거부 → setAttachment 호출 안 함", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("image", 0, 0);
    await new Promise((r) => setTimeout(r, 5));

    const setAttachSpy = vi.spyOn(useWorkspace.getState(), "setAttachment");

    installClipboard({
      read: vi.fn(async () => {
        const err = new Error("denied") as Error & { name: string };
        err.name = "NotAllowedError";
        throw err;
      }),
    } as Partial<Clipboard>);

    render(<Mount kind="image" cardId={id} />);
    await new Promise((r) => setTimeout(r, 10));

    expect(setAttachSpy).not.toHaveBeenCalled();
  });

  it("image: 이미 attachmentRef가 있으면 clipboard 시도 안 함", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const id = useWorkspace.getState().addCardAt("image", 0, 0);
    await new Promise((r) => setTimeout(r, 5));
    useWorkspace
      .getState()
      .setAttachment(id, "opfs:already.png", { content: "old" });

    const readSpy = vi.fn();
    installClipboard({ read: readSpy } as Partial<Clipboard>);

    render(<Mount kind="image" cardId={id} />);
    await new Promise((r) => setTimeout(r, 10));

    expect(readSpy).not.toHaveBeenCalled();
  });
});
