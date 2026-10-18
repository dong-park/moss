import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { encodeFrameContent } from "@/state/frameContent";
import { DraggableCard } from "@/components/workspace/DraggableCard";

const storePhoto = vi.fn();
vi.mock("@/components/workspace/canvasCapture", async (orig) => ({
  ...(await orig<typeof import("@/components/workspace/canvasCapture")>()),
  storePhoto: (f: File) => storePhoto(f),
}));
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: () => <div data-testid="inline-editor" />,
  ExpandedMarkdownEditor: () => <div />,
}));

function frameCard(withBg = false): Card {
  return {
    id: "f1",
    kind: "frame",
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    content: encodeFrameContent({ name: "판" }),
    ...(withBg ? { attachmentRef: "opfs://bg.png", mediaType: "image/png" } : {}),
  };
}

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

const setFrameBackground = vi.fn();
const clearFrameBackground = vi.fn();

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
  storePhoto.mockReset();
  setFrameBackground.mockReset();
  clearFrameBackground.mockReset();
  useWorkspace.setState({
    cards: [frameCard()],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode: false,
    draggingId: null,
    draggingMulti: false,
    viewport: { x: 0, y: 0, scale: 1 },
    setFrameBackground,
    clearFrameBackground,
  });
});

describe("DraggableCard · 판 배경 메뉴 (T5)", () => {
  it("배경이 없으면 '올리기…'만 보인다", () => {
    const { container } = wrap(<DraggableCard card={frameCard()} />);
    fireEvent.contextMenu(container.querySelector('[data-card-id="f1"]')!);
    expect(screen.getByText("배경 이미지 올리기…")).toBeTruthy();
    expect(screen.queryByText("배경 이미지 바꾸기…")).toBeNull();
    expect(screen.queryByText("배경 이미지 지우기")).toBeNull();
  });

  it("배경이 있으면 '바꾸기…'와 '지우기'로 바뀌고, 지우기가 clearFrameBackground를 부른다", () => {
    const { container } = wrap(<DraggableCard card={frameCard(true)} />);
    fireEvent.contextMenu(container.querySelector('[data-card-id="f1"]')!);
    expect(screen.getByText("배경 이미지 바꾸기…")).toBeTruthy();
    expect(screen.queryByText("배경 이미지 올리기…")).toBeNull();
    fireEvent.click(screen.getByText("배경 이미지 지우기"));
    expect(clearFrameBackground).toHaveBeenCalledWith("f1");
  });

  it("고른 파일을 저장해 setFrameBackground로 넘긴다", async () => {
    storePhoto.mockResolvedValue({ ref: "opfs://new.png", mediaType: "image/png", naturalW: 800, naturalH: 400 });
    const { container } = wrap(<DraggableCard card={frameCard()} />);
    const input = container.ownerDocument.querySelector('[data-frame-bg-input="true"]') as HTMLInputElement;
    const file = new File(["x"], "bg.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(setFrameBackground).toHaveBeenCalled());
    expect(setFrameBackground).toHaveBeenCalledWith("f1", {
      ref: "opfs://new.png",
      mediaType: "image/png",
      w: 800,
      h: 400,
    });
  });

  it("저장이 거부되면(용량·형식) 판은 그대로다", async () => {
    storePhoto.mockResolvedValue(null);
    const { container } = wrap(<DraggableCard card={frameCard()} />);
    const input = container.ownerDocument.querySelector('[data-frame-bg-input="true"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.bmp", { type: "image/bmp" })] },
    });
    await waitFor(() => expect(storePhoto).toHaveBeenCalled());
    expect(setFrameBackground).not.toHaveBeenCalled();
  });
});
