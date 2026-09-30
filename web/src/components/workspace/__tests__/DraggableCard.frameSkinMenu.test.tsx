import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { decodeFrameConfig, encodeFrameContent } from "@/state/frameContent";
import { DraggableCard } from "@/components/workspace/DraggableCard";

vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: () => <div data-testid="inline-editor" />,
  ExpandedMarkdownEditor: () => <div />,
}));

function frameCard(): Card {
  return {
    id: "f1",
    kind: "frame",
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    content: encodeFrameContent({ name: "판" }),
  };
}

function seed(cards: Card[]) {
  useWorkspace.setState({
    cards,
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode: false,
    draggingId: null,
    draggingMulti: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
}

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
  seed([frameCard()]);
});

describe("DraggableCard · 판 모양 메뉴 (AC-3)", () => {
  it("판을 우클릭하면 '판 모양' 하위 메뉴가 있다", () => {
    const f = frameCard();
    const { container } = wrap(<DraggableCard card={f} />);
    const root = container.querySelector('[data-card-id="f1"]')!;
    fireEvent.contextMenu(root);
    expect(screen.getByText("판 모양")).toBeTruthy();
  });

  it("'판 모양 → 세로 칸'을 고르면 스킨이 바뀐다", () => {
    const f = frameCard();
    const { container } = wrap(<DraggableCard card={f} />);
    fireEvent.contextMenu(container.querySelector('[data-card-id="f1"]')!);

    const subTrigger = container.ownerDocument.querySelector(
      '[data-frame-skin-menu="true"]',
    ) as HTMLElement;
    expect(subTrigger).toBeTruthy();
    fireEvent.keyDown(subTrigger, { key: "ArrowRight" });

    const item = container.ownerDocument.querySelector(
      '[data-frame-skin-item="columns"]',
    ) as HTMLElement;
    expect(item).toBeTruthy();
    fireEvent.click(item);

    expect(
      decodeFrameConfig(useWorkspace.getState().cards.find((c) => c.id === "f1")!.content)
        .skin,
    ).toBe("columns");
  });
});
