import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import {
  formatDeg,
  memoBaseTransform,
  memoLiftedTransform,
  memoRotationDeg,
} from "@/components/workspace/memoVariety";

/**
 * FEAT-memo-variety AC-3·4·5 — 카드 컨테이너 transform 배선.
 * 각도·색 계산 자체는 memoVariety.test.ts가, 색조 층은 MemoTint.test.tsx가 덮는다.
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
  ExpandedMarkdownEditor: () => null,
}));

function card(over: Partial<Card> = {}): Card {
  return { id: "c1", kind: "text", x: 0, y: 0, width: 300, content: "안녕", ...over };
}

function seed(cards: Card[], penMode = false) {
  useWorkspace.setState({
    cards,
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode,
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

describe("DraggableCard · memo variety", () => {
  it("메모는 들지 않아도 id에서 나온 각도로 기울어 있다", () => {
    const c = card();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");
    expect(el.style.transform).toBe(memoBaseTransform(c, false));
    expect(el.style.transform).toContain(
      `rotate(${formatDeg(memoRotationDeg("c1"))}deg)`,
    );
  });

  it("AC-3: 집어 들면 원래 각도에서 -1.5도를 더 기울고, 손을 떼면 돌아온다", () => {
    const c = card();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");
    const base = memoBaseTransform(c, false);

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    expect(el.style.transform).toBe(memoLiftedTransform(c, false));
    expect(el.style.transform).toContain("scale(1.03)");

    fireEvent.mouseUp(window, { clientX: 20, clientY: 0 });
    expect(el.style.transform).toBe(base);
  });

  it("AC-4: 펜 모드에서는 각도가 0이다", () => {
    const c = card();
    seed([c], true);
    const { container } = wrap(<DraggableCard card={c} />);
    expect(root(container, "c1").style.transform).toBe("rotate(0deg)");
  });

  it("AC-5: 메모판(frame)은 들지 않으면 무변화, 들면 기존과 같다", () => {
    const f = card({ id: "f1", kind: "frame", content: "" });
    seed([f]);
    const { container } = wrap(<DraggableCard card={f} />);
    const el = root(container, "f1");
    expect(memoBaseTransform(f, false)).toBeUndefined();
    expect(el.style.transform).toBe("");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 20, clientY: 0 });
    expect(el.style.transform).toBe("scale(1.03) rotate(-1.5deg)");
  });
});
