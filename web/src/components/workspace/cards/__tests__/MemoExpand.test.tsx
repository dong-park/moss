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
    overlay,
  }: {
    value: string;
    onChange: (md: string) => void;
    overlay?: import("react").ReactNode;
  }) => (
    <>
      <textarea
        data-testid="expanded-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {overlay}
    </>
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

describe("FEAT-memo-expand · 펜 overlay", () => {
  const overlayJson = JSON.stringify({
    paths: [[{ x: 1, y: 1 }, { x: 5, y: 5 }]],
  });

  // 모달은 Radix Portal(document.body)에 렌더되므로 container가 아닌 document로 쿼리.
  it("카드의 overlay(손글씨)를 모달에 polyline으로 렌더한다", () => {
    seed([textCard({ overlay: overlayJson })]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    expect(document.querySelectorAll("polyline")).toHaveLength(1);
  });

  it("그리기 토글 off에선 overlay가 pointer-events:none(클릭 통과)", () => {
    seed([textCard({ overlay: overlayJson })]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    const svg = document.querySelector("[data-drawing-layer]") as SVGElement;
    expect(svg.style.pointerEvents).toBe("none");
  });

  it("펜 버튼을 누르면 그리기 모드가 active(pointer-events:auto)된다", () => {
    seed([textCard({ overlay: overlayJson })]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    fireEvent.click(screen.getByLabelText("펜으로 그리기"));
    const svg = document.querySelector("[data-drawing-layer]") as SVGElement;
    expect(svg.style.pointerEvents).toBe("auto");
    expect(
      screen.getByLabelText("펜으로 그리기").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("지우개 버튼을 누르면 지우개 모드로 active된다", () => {
    seed([textCard({ overlay: overlayJson })]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    fireEvent.click(screen.getByLabelText("지우개"));
    expect(screen.getByLabelText("지우개").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.getByLabelText("펜으로 그리기").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("overlay가 없으면 polyline을 렌더하지 않는다", () => {
    seed([textCard()]);
    useWorkspace.getState().setExpandedCard("c1");
    wrap(<MemoExpandDialog />);
    expect(document.querySelectorAll("polyline")).toHaveLength(0);
  });
});
