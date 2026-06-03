import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

/**
 * FEAT-pen-mode-ux AC-2: 펜 모드에서 그릴 수 있는 곳 affordance.
 * - 메모(text) 카드 → "그릴 수 있음" 하이라이트(data-pen-drawable), 펜 커서 유지.
 * - 비메모 카드(comment 등) → 커서 not-allowed, 하이라이트 없음.
 *
 * Milkdown은 jsdom에서 불안정해 MarkdownEditor를 textarea로 모킹(dragLift 전략과 동일).
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({ value }: { value: string }) => (
    <textarea data-testid="inline-editor" defaultValue={value} />
  ),
  ExpandedMarkdownEditor: (props: { value: string }) => (
    <div data-testid="expanded-editor-wrap">{props.value}</div>
  ),
}));

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

const root = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    draggingId: null,
    draggingMulti: false,
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { x: 0, y: 0, scale: 1 },
    penMode: false,
  });
});

function textCard(over: Partial<Card> = {}): Card {
  return { id: "t1", kind: "text", x: 0, y: 0, width: 300, content: "안녕", ...over };
}
function commentCard(over: Partial<Card> = {}): Card {
  return { id: "n1", kind: "comment", x: 0, y: 0, width: 300, content: "메모", ...over };
}

describe("DraggableCard · 펜 모드 affordance", () => {
  it("펜 OFF면 메모 카드에도 하이라이트가 없다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], penMode: false });
    const { container } = wrap(<DraggableCard card={c} />);
    expect(root(container, "t1").querySelector("[data-pen-drawable]")).toBeNull();
  });

  it("펜 ON · 메모(text) 카드 → 그릴 수 있음 하이라이트 + not-allowed 아님", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], penMode: true });
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "t1");
    expect(el.querySelector("[data-pen-drawable]")).not.toBeNull();
    expect(el.className).not.toContain("cursor-not-allowed");
  });

  it("펜 ON · 비메모(comment) 카드 → not-allowed 커서 + 하이라이트 없음", () => {
    const c = commentCard();
    useWorkspace.setState({ cards: [c], penMode: true });
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "n1");
    expect(el.className).toContain("cursor-not-allowed");
    expect(el.querySelector("[data-pen-drawable]")).toBeNull();
  });
});
