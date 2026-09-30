import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import type { Board } from "@/state/db/schema";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { Breadcrumb } from "@/components/workspace/Breadcrumb";

/**
 * FEAT-eject: 함(서브캔버스) 밖으로 카드 내보내기 — 브레드크럼 드롭 + 우클릭 메뉴.
 *
 * Milkdown(ProseMirror)은 jsdom에서 불안정하므로 MarkdownEditor를 textarea stub으로
 * 모킹한다(dragLift/MemoExpand 테스트와 동일 전략). 역모션 애니메이션(WAAPI)은 jsdom에
 * 없으므로 runEject가 즉시 이동 경로를 타고, moveCardToBoard 호출만 검증한다.
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

// 실제 store 액션을 보관해 두고, 스파이로 갈아끼운 뒤 매 테스트 후 복원한다.
const realMoveCardToBoard = useWorkspace.getState().moveCardToBoard;

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

function textCard(over: Partial<Card> = {}): Card {
  return { id: "c1", kind: "text", x: 0, y: 0, width: 200, content: "안녕", ...over };
}

/** 부모 P → 현재 C(P의 자식). 브레드크럼 조상 = [P]. */
function seedSubcanvas(cards: Card[] = []) {
  useWorkspace.setState({
    boards: [
      { id: "P", name: "부모보드", parentBoardId: null },
      { id: "C", name: "자식보드", parentBoardId: "P" },
    ] as Board[],
    currentBoardId: "C",
    cards,
    selectedIds: [],
    editingId: null,
    penMode: false,
    draggingId: null,
    draggingMulti: false,
    dropTargetFunnelId: null,
    dropTargetCrumbId: null,
    viewport: { x: 0, y: 0, scale: 1 },
  });
}

beforeEach(() => {
  // jsdom엔 elementsFromPoint가 없다 — 드래그의 crumb/funnel 탐지가 매 onMove마다
  // 호출하므로 기본 빈 배열 stub. 각 테스트에서 필요 시 덮어쓴다.
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  // Radix ContextMenu(Popper) 의존 — jsdom에 없을 수 있는 API들 방어 stub.
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  useWorkspace.setState({ moveCardToBoard: realMoveCardToBoard });
});

describe("브레드크럼 드롭으로 밖으로 내보내기", () => {
  it("조각 위 hover 시 dropTargetCrumbId 세팅, 벗어나면 해제", () => {
    const card = textCard();
    seedSubcanvas([card]);
    const { container } = wrap(
      <>
        <Breadcrumb />
        <DraggableCard card={card} />
      </>,
    );
    const crumb = container.querySelector(
      '[data-crumb-board-id="P"]',
    ) as HTMLElement;
    expect(crumb).toBeTruthy();

    // 커서 아래에 조각이 있다고 stub
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
      () => [crumb];

    const el = container.querySelector('[data-card-id="c1"]') as HTMLElement;
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 }); // 임계 초과 → 탐지
    expect(useWorkspace.getState().dropTargetCrumbId).toBe("P");

    // 조각을 벗어나면 해제
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
      () => [];
    fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });
    expect(useWorkspace.getState().dropTargetCrumbId).toBeNull();

    fireEvent.mouseUp(window, { clientX: 40, clientY: 0 });
  });

  it("조각 위에서 놓으면 moveCardToBoard(cardId, crumbBoardId) 호출", () => {
    const card = textCard();
    seedSubcanvas([card]);
    const moveSpy = vi.fn(async () => {});
    useWorkspace.setState({ moveCardToBoard: moveSpy });

    const { container } = wrap(
      <>
        <Breadcrumb />
        <DraggableCard card={card} />
      </>,
    );
    const crumb = container.querySelector(
      '[data-crumb-board-id="P"]',
    ) as HTMLElement;
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
      () => [crumb];

    const el = container.querySelector('[data-card-id="c1"]') as HTMLElement;
    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });

    expect(moveSpy).toHaveBeenCalledWith("c1", "P");
  });
});

describe("우클릭 메뉴로 밖으로 내보내기", () => {
  it("서브캔버스 안에서 '상위로 내보내기' 노출 + 클릭 시 moveCardToBoard 호출", async () => {
    const card = textCard();
    seedSubcanvas([card]);
    const moveSpy = vi.fn(async () => {});
    useWorkspace.setState({ moveCardToBoard: moveSpy });

    const { container } = wrap(<DraggableCard card={card} />);
    const el = container.querySelector('[data-card-id="c1"]') as HTMLElement;
    fireEvent.contextMenu(el);

    const item = await screen.findByText("상위로 내보내기");
    expect(item).toBeTruthy();
    fireEvent.click(item);

    expect(moveSpy).toHaveBeenCalledWith("c1", "P");
  });

  it("루트/시스템 보드(조상 없음)에서는 우클릭 메뉴를 렌더하지 않는다", () => {
    useWorkspace.setState({
      boards: [],
      currentBoardId: SYSTEM_BOARD_ID,
      cards: [],
      selectedIds: [],
      editingId: null,
      penMode: false,
      draggingId: null,
      draggingMulti: false,
      dropTargetCrumbId: null,
      viewport: { x: 0, y: 0, scale: 1 },
    });
    const card = textCard();
    useWorkspace.setState({ cards: [card] });

    const { container } = wrap(<DraggableCard card={card} />);
    const el = container.querySelector('[data-card-id="c1"]') as HTMLElement;
    fireEvent.contextMenu(el);

    expect(screen.queryByText("상위로 내보내기")).toBeNull();
  });
});

describe("파일함 우클릭 → 이름 바꾸기", () => {
  it("루트에서도 메뉴가 뜨고, 입력 뒤 Enter면 보드 이름을 바꾼다", async () => {
    const renameBoard = vi.fn(async () => {});
    const realRename = useWorkspace.getState().renameBoard;
    useWorkspace.setState({
      boards: [
        { id: "P", name: "부모보드", parentBoardId: null },
        { id: "sub", name: "", parentBoardId: "P" },
      ] as Board[],
      currentBoardId: "P",
      editingId: null,
      penMode: false,
      renameBoard,
    });
    const card: Card = { id: "f1", kind: "board", x: 0, y: 0, width: 200, content: "", boardRef: "sub" };
    const { container } = wrap(<DraggableCard card={card} />);

    fireEvent.contextMenu(container.querySelector("[data-card-id='f1']")!);
    fireEvent.click(await screen.findByText("이름 바꾸기"));

    const input = await screen.findByLabelText("이름 바꾸기");
    fireEvent.change(input, { target: { value: "  회의록 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(renameBoard).toHaveBeenCalledWith("sub", "회의록");
    expect(useWorkspace.getState().editingId).toBeNull();
    useWorkspace.setState({ renameBoard: realRename });
  });
});

describe("사진 우클릭 → 캡션 달기", () => {
  it("메뉴가 닫힌 뒤에도 포커스가 캡션 입력칸에 있다", async () => {
    useWorkspace.setState({
      boards: [{ id: "P", name: "부모보드", parentBoardId: null }] as Board[],
      currentBoardId: "P",
      editingId: null,
      penMode: false,
    });
    const card: Card = {
      id: "p1", kind: "photo", x: 0, y: 0, width: 240, height: 180, content: "",
      attachmentRef: "opfs:x.png", mediaType: "image/png",
    };
    const { container } = wrap(<DraggableCard card={card} />);

    fireEvent.contextMenu(container.querySelector("[data-card-id='p1']")!);
    fireEvent.click(await screen.findByText("캡션 달기"));

    const input = await screen.findByPlaceholderText("캡션 한 줄");
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(input);
  });
});
