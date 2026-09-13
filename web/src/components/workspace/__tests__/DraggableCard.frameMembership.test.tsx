import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";

/**
 * FEAT-sticky-redesign 2단계 리뷰 P1:
 * 1. 판(frame)은 선택돼도 z-index가 메모보다 낮아야 한다.
 * 2. 다중 선택에 판이 섞여 있으면 드롭 종료 시 보드 전체(비-frame)를 재판정해야
 *    새로 판 안에 들어오거나 빠진 "비선택" 카드도 소속이 갱신된다.
 *
 * Milkdown은 jsdom에서 신뢰성이 낮아 dragLift 테스트와 동일하게 stub 처리.
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

function frameCard(over: Partial<Card> = {}): Card {
  return { id: "f1", kind: "frame", x: 0, y: 0, width: 320, height: 220, content: '{"name":"판"}', ...over };
}

function memoCard(over: Partial<Card> = {}): Card {
  return { id: "m1", kind: "text", x: 100, y: 100, width: 100, height: 100, content: "", ...over };
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
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  seed([]);
});

describe("DraggableCard · frame z-index", () => {
  it("선택된 frame의 z-index는 항상 미선택 메모보다 낮다", () => {
    const f = frameCard();
    const m = memoCard();
    seed([f, m]);
    const { container } = wrap(
      <>
        <DraggableCard card={f} />
        <DraggableCard card={m} />
      </>,
    );
    const elF = root(container, "f1");
    const elM = root(container, "m1");

    // frame 미선택일 때
    expect(Number(elF.style.zIndex)).toBeLessThan(Number(elM.style.zIndex));

    // frame만 선택 — 이전 버그: selected면 20이 되어 미선택 메모(10)보다 위로 올라갔다.
    seed([f, m], ["f1"]);
    const { container: c2 } = wrap(
      <>
        <DraggableCard card={f} />
        <DraggableCard card={m} />
      </>,
    );
    const elF2 = root(c2, "f1");
    const elM2 = root(c2, "m1");
    expect(Number(elF2.style.zIndex)).toBeLessThan(Number(elM2.style.zIndex));
  });
});

describe("DraggableCard · 다중 선택 드래그에 frame이 섞이면 보드 전체 재판정", () => {
  it("frame+멤버를 함께 옮기면, 선택 안 된 카드도 새 위치 기준으로 소속이 갱신된다", () => {
    const f = frameCard({ id: "f1", x: 0, y: 0, width: 320, height: 220 });
    const member = memoCard({ id: "member", x: 100, y: 100, frameId: "f1" });
    // stray는 원래 frame 밖(중심 1100,1100)에 있다가, frame이 +1000,+1000 이동하면
    // 새 frame 영역(1000..1320, 1000..1220) 안으로 들어온다. stray는 선택하지 않는다.
    const stray = memoCard({ id: "stray", x: 1050, y: 1050 });
    seed([f, member, stray], ["f1", "member"]);

    const { container } = wrap(
      <>
        <DraggableCard card={f} />
        <DraggableCard card={member} />
        <DraggableCard card={stray} />
      </>,
    );
    const elF = root(container, "f1");

    fireEvent.mouseDown(elF, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 1000, clientY: 1000 });
    fireEvent.mouseUp(window, { clientX: 1000, clientY: 1000 });

    const strayAfter = useWorkspace.getState().cards.find((c) => c.id === "stray")!;
    // stray 자체는 위치가 바뀌지 않았지만(비선택이라 이동 안 함), frame이 새로
    // stray 위치를 덮게 되어 resolveMembership(보드 전체)이 stray를 frame 소속으로 잡는다.
    expect(strayAfter.x).toBe(1050);
    expect(strayAfter.frameId).toBe("f1");
  });
});
