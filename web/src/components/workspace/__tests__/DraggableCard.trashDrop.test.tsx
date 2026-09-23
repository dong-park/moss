import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

/**
 * FEAT-trash-drag: 카드를 독의 휴지통 위로 끌어 버리기.
 *
 * jsdom엔 WAAPI(element.animate)가 없으므로 runTrash가 즉시 삭제 경로를 탄다 —
 * 삭제 위임(remove/removeSelected)만 검증한다. 실제 종류별 분기는 remove 자체가
 * 갖고 있고 frames·trash 테스트가 맡는다.
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

const realRemove = useWorkspace.getState().remove;
const realRemoveSelected = useWorkspace.getState().removeSelected;

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

function card(over: Partial<Card> = {}): Card {
  return { id: "c1", kind: "text", x: 0, y: 0, width: 200, content: "안녕", ...over };
}

function frameCard(over: Partial<Card> = {}): Card {
  return { id: "f1", kind: "frame", x: 0, y: 0, width: 320, height: 220, content: '{"name":"판"}', ...over };
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
    dropTargetFunnelId: null,
    dropTargetCrumbId: null,
    dropTargetTrash: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
}

/** elementsFromPoint가 돌려줄 요소 목록을 설정. jsdom엔 이 API가 없다. */
function under(els: Element[]) {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => els;
}

function trashEl(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-dock-id", "trash");
  return el;
}

const root = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

beforeEach(() => {
  under([]);
  useWorkspace.setState({ dropTargetTrash: false });
});

afterEach(() => {
  useWorkspace.setState({ remove: realRemove, removeSelected: realRemoveSelected });
});

describe("FEAT-trash-drag · DraggableCard", () => {
  it("AC-1: 메모를 휴지통 위에서 놓으면 remove(id)를 부른다", () => {
    const c = card({ id: "c1" });
    seed([c]);
    const removeSpy = vi.fn();
    const removeSelectedSpy = vi.fn();
    useWorkspace.setState({ remove: removeSpy, removeSelected: removeSelectedSpy });

    const { container } = wrap(<DraggableCard card={c} />);
    const trash = trashEl();
    under([trash]);

    const el = root(container, "c1");
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    expect(useWorkspace.getState().dropTargetTrash).toBe(true);
    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });

    expect(removeSpy).toHaveBeenCalledWith("c1");
    expect(removeSelectedSpy).not.toHaveBeenCalled();
    // 놓은 뒤 강조가 풀린다.
    expect(useWorkspace.getState().dropTargetTrash).toBe(false);
  });

  it("AC-2: 판을 놓으면 remove(frameId)를 부른다(Delete와 같은 삭제 경로 재사용)", () => {
    const f = frameCard({ id: "f1" });
    seed([f]);
    const removeSpy = vi.fn();
    useWorkspace.setState({ remove: removeSpy });

    const { container } = wrap(<DraggableCard card={f} />);
    under([trashEl()]);

    const el = root(container, "f1");
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });

    expect(removeSpy).toHaveBeenCalledWith("f1");
  });

  it("AC-4: 다중 선택 드롭은 removeSelected 1회, remove는 안 부른다", () => {
    const dragged = card({ id: "m1" });
    const cards: Card[] = [
      dragged,
      card({ id: "m2" }),
      card({ id: "m3" }),
      frameCard({ id: "f1" }),
      { id: "b1", kind: "board", x: 0, y: 0, width: 200, content: "", boardRef: "sub" },
    ];
    seed(cards, ["m1", "m2", "m3", "f1", "b1"]);
    const removeSpy = vi.fn();
    const removeSelectedSpy = vi.fn();
    useWorkspace.setState({ remove: removeSpy, removeSelected: removeSelectedSpy });

    const { container } = wrap(<DraggableCard card={dragged} />);
    under([trashEl()]);

    const el = root(container, "m1");
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });

    expect(removeSelectedSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("AC-6: 휴지통 위로 오면 크럼 강조를 버리고 휴지통 강조만 켠다", () => {
    const c = card({ id: "c1" });
    const removeSpy = vi.fn();
    useWorkspace.setState({ currentBoardId: SYSTEM_BOARD_ID, boards: [], remove: removeSpy });
    seed([c]);

    const { container } = wrap(<DraggableCard card={c} />);
    const crumb = document.createElement("div");
    crumb.setAttribute("data-crumb-board-id", "P");

    const el = root(container, "c1");
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });

    // 크럼 위 → 크럼 강조.
    under([crumb]);
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    expect(useWorkspace.getState().dropTargetCrumbId).toBe("P");

    // 휴지통 위 → 크럼 강조를 버리고 휴지통 강조만.
    under([trashEl(), crumb]);
    fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });
    expect(useWorkspace.getState().dropTargetTrash).toBe(true);
    expect(useWorkspace.getState().dropTargetCrumbId).toBeNull();
    expect(useWorkspace.getState().dropTargetFunnelId).toBeNull();

    fireEvent.mouseUp(window, { clientX: 40, clientY: 0 });
  });

  it("AC-8: 휴지통을 지나쳐 밖에서 놓으면 아무것도 지워지지 않는다", () => {
    const c = card({ id: "c1" });
    seed([c]);
    const removeSpy = vi.fn();
    useWorkspace.setState({ remove: removeSpy });

    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });

    under([trashEl()]);
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    expect(useWorkspace.getState().dropTargetTrash).toBe(true);

    under([]);
    fireEvent.mouseMove(window, { clientX: 60, clientY: 0 });
    expect(useWorkspace.getState().dropTargetTrash).toBe(false);

    fireEvent.mouseUp(window, { clientX: 60, clientY: 0 });
    expect(removeSpy).not.toHaveBeenCalled();
    expect(useWorkspace.getState().dropTargetTrash).toBe(false);
  });
});
