import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { MemoExpandDialog } from "@/components/workspace/cards/MemoExpandDialog";

/**
 * FEAT-memo-expand — 펼치기 버튼 + 모달 배선.
 *
 * Milkdown(ProseMirror)은 jsdom에서 신뢰성이 낮아 MarkdownEditor 모듈을 textarea
 * stub으로 모킹한다(기존 CardContent.text.test와 동일 전략). 여기서는 카드↔스토어↔
 * 모달 사이의 배선(버튼 노출/클릭→expandedCardId, 모달 open/close, onChange→content)만 본다.
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (md: string) => void;
  }) => (
    <textarea
      data-testid="inline-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  ExpandedMarkdownEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (md: string) => void;
  }) => (
    <textarea
      data-testid="expanded-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

function textCard(over: Partial<Card> = {}): Card {
  return { id: "c1", kind: "text", x: 0, y: 0, width: 300, content: "안녕", ...over };
}

function seed(cards: Card[]) {
  useWorkspace.setState({
    cards,
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode: false,
  });
}

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

beforeEach(() => seed([]));

describe("FEAT-memo-expand · 펼치기 버튼", () => {
  it("text(메모) 카드는 펼치기 버튼을 렌더한다", () => {
    const c = textCard();
    seed([c]);
    wrap(<DraggableCard card={c} />);
    expect(screen.getByLabelText("펼쳐서 편집")).toBeTruthy();
  });

  it("펜 모드에선 펼치기 버튼을 숨긴다", () => {
    const c = textCard();
    seed([c]);
    useWorkspace.setState({ penMode: true });
    wrap(<DraggableCard card={c} />);
    expect(screen.queryByLabelText("펼쳐서 편집")).toBeNull();
  });

  it("text가 아닌 카드(image)엔 펼치기 버튼이 없다", () => {
    const c = textCard({ kind: "image", content: "" });
    seed([c]);
    wrap(<DraggableCard card={c} />);
    expect(screen.queryByLabelText("펼쳐서 편집")).toBeNull();
  });

  it("클릭하면 expandedCardId가 그 카드로 설정된다", () => {
    const c = textCard();
    seed([c]);
    wrap(<DraggableCard card={c} />);
    fireEvent.click(screen.getByLabelText("펼쳐서 편집"));
    expect(useWorkspace.getState().expandedCardId).toBe("c1");
  });
});

describe("FEAT-memo-expand · 더블클릭 확대", () => {
  const cardRoot = (container: HTMLElement) =>
    container.querySelector("[data-card-id]") as HTMLElement;

  it("text 카드를 더블클릭하면 확대 모달이 열린다(expandedCardId 설정)", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    fireEvent.doubleClick(cardRoot(container));
    expect(useWorkspace.getState().expandedCardId).toBe("c1");
  });

  it("text 카드 더블클릭은 인라인 편집(editingId)을 켜지 않는다", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    fireEvent.doubleClick(cardRoot(container));
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("text가 아닌 카드(image)는 더블클릭 시 기존대로 인라인 편집에 진입한다", () => {
    const c = textCard({ kind: "image", content: "" });
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    fireEvent.doubleClick(cardRoot(container));
    expect(useWorkspace.getState().editingId).toBe("c1");
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });

  it("펜 모드에선 더블클릭으로 확대가 열리지 않는다", () => {
    const c = textCard();
    seed([c]);
    useWorkspace.setState({ penMode: true });
    const { container } = wrap(<DraggableCard card={c} />);
    fireEvent.doubleClick(cardRoot(container));
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });
});

describe("FEAT-memo-expand · 모달", () => {
  it("expandedCardId가 있으면 모달이 열리고 카드 내용을 보여준다", () => {
    seed([textCard({ content: "# 제목" })]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (screen.getByTestId("expanded-editor") as HTMLTextAreaElement).value,
    ).toBe("# 제목");
  });

  it("닫힘 상태(expandedCardId=null)에선 모달을 렌더하지 않는다", () => {
    seed([textCard()]);
    wrap(<MemoExpandDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("모달 편집은 setContent로 카드 content에 반영된다", () => {
    seed([textCard({ content: "" })]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    fireEvent.change(screen.getByTestId("expanded-editor"), {
      target: { value: "- [ ] 할 일" },
    });
    expect(useWorkspace.getState().cards[0].content).toBe("- [ ] 할 일");
  });

  it("닫기 버튼을 누르면 expandedCardId가 null로 닫힌다", () => {
    seed([textCard()]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    fireEvent.click(screen.getByLabelText("닫기"));
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });
});
