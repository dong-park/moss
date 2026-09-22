import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

/**
 * 드래그 grab/drop 손맛 — 들어올림(lift)·안착(settle) 상태 전이.
 *
 * Milkdown(ProseMirror)은 jsdom에서 신뢰성이 낮아 MarkdownEditor를 textarea stub으로
 * 모킹한다(MemoExpand.test와 동일 전략). 여기선 lift 상태(draggingId/draggingMulti)와
 * 카드 root에 실제로 적용되는 lift 인라인 스타일(transform/zIndex)만 본다.
 *
 * 흡수(함 위 드롭) 경로는 jsdom에서 elementsFromPoint/getBoundingClientRect가
 * 빈값·0을 돌려줘 funnel 탐지가 불가능하므로 단위 테스트 대상에서 제외한다.
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
  ExpandedMarkdownEditor: (props: { value: string }) => (
    <div data-testid="expanded-editor-wrap">{props.value}</div>
  ),
}));

function textCard(over: Partial<Card> = {}): Card {
  return { id: "c1", kind: "text", x: 0, y: 0, width: 300, content: "안녕", ...over };
}

function seed(cards: Card[], selectedIds: string[] = []) {
  useWorkspace.setState({
    cards,
    selectedIds,
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

const root = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

beforeEach(() => {
  // jsdom엔 elementsFromPoint가 없다(실브라우저엔 있음). 단일 카드 드래그의
  // 함 탐지(findFunnelUnder)가 onMove마다 호출하므로 빈 배열 stub으로 대체.
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  seed([]);
});

describe("DraggableCard · grab lift", () => {
  it("임계(3px)를 넘기면 draggingId가 그 카드로 설정되고 lift 스타일이 적용된다", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    // 임계 이하 — 아직 lift 아님
    fireEvent.mouseMove(window, { clientX: 2, clientY: 0 });
    expect(useWorkspace.getState().draggingId).toBeNull();

    // 임계 초과 — lift 시작
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
    expect(useWorkspace.getState().draggingId).toBe("c1");
    expect(useWorkspace.getState().draggingMulti).toBe(false);
    // FEAT-drag-tilt: 단일 메모는 1.03배를 CSS 변수 --lift-scale로 받는다.
    expect(el.style.transform).toContain("var(--lift-scale");
    expect(el.style.getPropertyValue("--lift-scale")).toBe("1.03");
    expect(el.style.zIndex).toBe("40");
  });

  it("드롭(mouseup)하면 lift가 해제되어 안착한다(draggingId=null)", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    expect(useWorkspace.getState().draggingId).toBe("c1");

    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });
    expect(useWorkspace.getState().draggingId).toBeNull();
    expect(el.style.transform).not.toContain("scale(1.03)");
  });

  it("움직이지 않은 단순 클릭은 lift하지 않는다", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.mouseUp(window, { clientX: 5, clientY: 5 });
    expect(useWorkspace.getState().draggingId).toBeNull();
    expect(el.style.transform).not.toContain("scale(1.03)");
  });
});

describe("DraggableCard · 묶음 lift", () => {
  it("묶음 드래그를 시작하면 선택된 카드 전부가 함께 떠오른다", () => {
    const a = textCard({ id: "a", x: 0 });
    const b = textCard({ id: "b", x: 400 });
    seed([a, b], ["a", "b"]);
    const { container } = wrap(
      <>
        <DraggableCard card={a} />
        <DraggableCard card={b} />
      </>,
    );
    const elA = root(container, "a");
    const elB = root(container, "b");

    fireEvent.mouseDown(elA, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });

    expect(useWorkspace.getState().draggingMulti).toBe(true);
    expect(useWorkspace.getState().draggingId).toBe("a");
    // 잡지 않은 b도 선택에 포함되어 함께 lift
    expect(elA.style.transform).toContain("scale(1.03)");
    expect(elB.style.transform).toContain("scale(1.03)");

    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });
    expect(useWorkspace.getState().draggingId).toBeNull();
    expect(useWorkspace.getState().draggingMulti).toBe(false);
    expect(elA.style.transform).not.toContain("scale(1.03)");
    expect(elB.style.transform).not.toContain("scale(1.03)");
  });

  it("비선택 카드는 묶음 드래그 중에도 떠오르지 않는다", () => {
    const a = textCard({ id: "a", x: 0 });
    const b = textCard({ id: "b", x: 400 });
    const c = textCard({ id: "c", x: 800 });
    seed([a, b, c], ["a", "b"]); // c는 선택 밖
    const { container } = wrap(
      <>
        <DraggableCard card={a} />
        <DraggableCard card={b} />
        <DraggableCard card={c} />
      </>,
    );
    const elC = root(container, "c");

    fireEvent.mouseDown(root(container, "a"), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });

    expect(useWorkspace.getState().draggingMulti).toBe(true);
    expect(elC.style.transform).not.toContain("scale(1.03)");
  });
});
