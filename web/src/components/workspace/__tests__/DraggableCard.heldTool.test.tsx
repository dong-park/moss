import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { memoBaseTransform } from "@/components/workspace/memoVariety";

/**
 * wall-marker n2 (T7, D7): 마카·천을 들고 있으면 포스트잇이 끌리지도 편집되지도 않는다.
 * 기울기는 그대로다. 옛 "펜 모드 affordance"(그릴 수 있음 하이라이트·not-allowed 커서)는 없다.
 *
 * Milkdown은 jsdom에서 불안정해 MarkdownEditor를 textarea로 모킹한다(dragLift 전략과 동일).
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
    heldTool: null,
  });
});

function textCard(over: Partial<Card> = {}): Card {
  return { id: "t1", kind: "text", x: 10, y: 20, width: 300, content: "안녕", ...over };
}
function boardCard(over: Partial<Card> = {}): Card {
  return { id: "n1", kind: "board", x: 0, y: 0, width: 300, content: "", ...over };
}

describe("DraggableCard · 손에 든 도구", () => {
  it("아무것도 안 들었으면 끌면 포스트잇이 끌린다 (기준선)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c] });
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "t1");
    expect(el.className).toContain("cursor-grab");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });
    expect(useWorkspace.getState().draggingId).toBe("t1");
    fireEvent.mouseUp(window, { clientX: 40, clientY: 0 });
  });

  it("마카를 들고 있으면 포스트잇을 끌어도 움직이지 않는다 (T7)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "black" } });
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "t1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 30 });
    fireEvent.mouseUp(window, { clientX: 60, clientY: 30 });

    expect(useWorkspace.getState().draggingId).toBeNull();
    const after = useWorkspace.getState().cards.find((x) => x.id === "t1")!;
    expect([after.x, after.y]).toEqual([10, 20]);
  });

  it("천을 들고 있어도 포스트잇은 끌리지 않는다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "cloth" } });
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "t1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 30 });
    fireEvent.mouseUp(window, { clientX: 60, clientY: 30 });

    expect(useWorkspace.getState().draggingId).toBeNull();
    const after = useWorkspace.getState().cards.find((x) => x.id === "t1")!;
    expect([after.x, after.y]).toEqual([10, 20]);
  });

  it("마카를 든 채 두 번 눌러도 글 편집도 펼치기도 열리지 않는다 (T7)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "blue" } });
    const { container } = wrap(<DraggableCard card={c} />);

    fireEvent.doubleClick(root(container, "t1"));

    expect(useWorkspace.getState().editingId).toBeNull();
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });

  it("마카를 들어도 포스트잇 기울기는 그대로다 (D7=A)", () => {
    const c = textCard({ id: "pick-84" });
    useWorkspace.setState({ cards: [c], heldTool: null });
    const { container, rerender } = wrap(<DraggableCard card={c} />);
    const resting = root(container, "pick-84").style.transform;
    expect(resting).toBe(memoBaseTransform(c));
    expect(resting).not.toBe("rotate(0deg)");

    useWorkspace.setState({ heldTool: { kind: "marker", color: "blue" } });
    rerender(
      <I18nProvider locale="ko">
        <DraggableCard card={c} />
      </I18nProvider>,
    );
    expect(root(container, "pick-84").style.transform).toBe(resting);
  });

  it("옛 펜 affordance가 없다 — 그릴 수 있음 하이라이트도 not-allowed 커서도 없다", () => {
    const m = textCard();
    const b = boardCard();
    useWorkspace.setState({ cards: [m, b], heldTool: { kind: "marker", color: "red" } });
    const { container } = wrap(
      <>
        <DraggableCard card={m} />
        <DraggableCard card={b} />
      </>,
    );
    for (const id of ["t1", "n1"]) {
      const el = root(container, id);
      expect(el.className).not.toContain("cursor-not-allowed");
      // 벽의 마카 포인터를 그대로 물려받는다 — 카드가 자기 커서를 덮어쓰지 않는다.
      expect(el.className).not.toContain("cursor-grab");
      expect(el.querySelector("[data-pen-drawable]")).toBeNull();
    }
  });
});
