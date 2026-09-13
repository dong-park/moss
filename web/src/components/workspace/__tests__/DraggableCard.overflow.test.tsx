import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

/**
 * FEAT-sticky-redesign n10 브라우저 결함3: 블록 막대(고정폭 720px 컬럼)가 카드
 * 오른쪽 가장자리 밖으로 튀어나왔다 — DraggableCard 루트의 overflow:hidden이
 * card.height가 undefined(auto-grow)일 때만 켜졌기 때문이다. width 크롭은
 * card.height 유무와 무관하게 항상 걸려야 한다.
 *
 * Milkdown은 jsdom에서 신뢰성이 낮아 MarkdownEditor를 stub 처리한다(저장소
 * 전반의 기존 전략과 동일).
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: () => <div data-testid="inline-editor" />,
  ExpandedMarkdownEditor: () => null,
}));

function wrap(ui: ReactNode) {
  const { container } = render(<I18nProvider locale="ko">{ui}</I18nProvider>);
  return container;
}

function textCard(over: Partial<Card> = {}): Card {
  return { id: "t1", kind: "text", x: 0, y: 0, width: 240, content: "", ...over };
}

describe("DraggableCard · 결함3 overflow 크롭", () => {
  it("card.height가 없어도(auto-grow) 루트는 overflow:hidden이다", () => {
    const card = textCard({ height: undefined });
    useWorkspace.setState({ cards: [card], selectedIds: [], editingId: null });
    const container = wrap(<DraggableCard card={card} />);
    const el = container.querySelector(`[data-card-id="t1"]`) as HTMLElement;
    expect(el.style.overflow).toBe("hidden");
  });

  it("card.height가 있을 때도 여전히 overflow:hidden이다(회귀 방지)", () => {
    const card = textCard({ height: 200 });
    useWorkspace.setState({ cards: [card], selectedIds: [], editingId: null });
    const container = wrap(<DraggableCard card={card} />);
    const el = container.querySelector(`[data-card-id="t1"]`) as HTMLElement;
    expect(el.style.overflow).toBe("hidden");
  });
});
