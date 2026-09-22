import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { MAX_TILT_DEG } from "@/components/workspace/dragTilt";

/**
 * FEAT-drag-tilt: 단일 메모 드래그의 동적 기울기(AC-1~5, 7, 8).
 * 기존 dragLift 테스트(AC-6)는 그대로 두고, 여기서 새 동작만 검증한다.
 * Milkdown은 dragLift와 동일하게 textarea stub으로 모킹.
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

function boardCard(over: Partial<Card> = {}): Card {
  return { id: "f", kind: "board", x: 0, y: 0, width: 200, content: "", ...over };
}

function seed(cards: Card[]) {
  useWorkspace.setState({
    cards,
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode: false,
    draggingId: null,
    draggingMulti: false,
    dropTargetFunnelId: null,
    dropTargetCrumbId: null,
    viewport: { x: 0, y: 0, scale: 1 },
  });
}

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

const root = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function rotateDeg(el: HTMLElement): number {
  const m = el.style.transform.match(/rotate\((-?[\d.]+)deg\)/);
  if (!m) throw new Error(`no rotate in "${el.style.transform}"`);
  return parseFloat(m[1]);
}

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  stubMatchMedia(false);
  seed([]);
});

afterEach(() => {
  // 드래그 중 끝난 테스트가 window에 남긴 onMove/onUp 리스너와 rAF 루프를 정리한다.
  // (mouseUp을 안 부르면 다음 테스트의 mousemove가 옛 핸들러까지 돌려 스토어 쓰기가 늘어난다.)
  fireEvent.mouseUp(window);
  vi.restoreAllMocks();
});

describe("FEAT-drag-tilt · 드래그 중 기울기", () => {
  it("AC-1: 오른쪽으로 빠르게 끌면 시계 반대(음수)로 기울고 상한을 넘지 않는다", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 0 });

    const deg = rotateDeg(el);
    expect(deg).toBeLessThan(0);
    expect(Math.abs(deg)).toBeLessThanOrEqual(MAX_TILT_DEG);
  });

  it("AC-3: 회전축(transform-origin)이 잡은 지점(카드 로컬)이다", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 30, clientY: 40 });
    fireEvent.mouseMove(window, { clientX: 50, clientY: 40 });

    expect(el.style.transformOrigin).toBe("30px 40px");
  });

  it("AC-2: 끌다 멈추고 누른 채로 있으면 0도 근처로 돌아온다", () => {
    vi.useFakeTimers();
    try {
      const c = textCard();
      seed([c]);
      const { container } = wrap(<DraggableCard card={c} />);
      const el = root(container, "c1");

      fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 80, clientY: 0 });
      expect(Math.abs(rotateDeg(el))).toBeGreaterThan(0.3);

      // 커서를 멈춘 채 프레임만 흐르면 rAF 루프가 각도를 0으로 수렴시킨다.
      vi.advanceTimersByTime(1000);
      expect(Math.abs(rotateDeg(el))).toBeLessThan(0.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-8: 드래그 중 기울기 갱신이 스토어에 쓰지 않는다", () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 }); // lift 시작

    const listener = vi.fn();
    const unsub = useWorkspace.subscribe(listener);
    for (let i = 1; i <= 5; i++) {
      fireEvent.mouseMove(window, { clientX: 12 + i * 10, clientY: 0 });
    }
    // 각 이동마다 moveCard의 스토어 쓰기 1회뿐 — 기울기는 DOM에만 쓴다.
    expect(listener).toHaveBeenCalledTimes(5);
    unsub();
  });

  it("AC-4: 놓으면 흔들림 안착이 끝난 뒤 transform과 origin이 기본값으로 돌아온다", async () => {
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 0 });
    expect(el.style.transformOrigin).not.toBe("");

    fireEvent.mouseUp(window, { clientX: 90, clientY: 0 });

    await waitFor(() => expect(el.style.transformOrigin).toBe(""), {
      timeout: 3000,
    });
    expect(el.style.transform).toBe("");
  });

  it("AC-7: reduced-motion이면 지금의 고정 -1.5도와 170ms 안착을 쓴다", () => {
    stubMatchMedia(true);
    const c = textCard();
    seed([c]);
    const { container } = wrap(<DraggableCard card={c} />);
    const el = root(container, "c1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 90, clientY: 0 });

    expect(el.style.transform).toContain("rotate(-1.5deg)");
    expect(el.style.transformOrigin).toBe("");
    expect(el.style.transition).toContain("transform 170ms");

    fireEvent.mouseUp(window, { clientX: 90, clientY: 0 });
    expect(el.style.transform).not.toContain("scale(1.03)");
  });
});

describe("FEAT-drag-tilt · 흡수 첫 프레임", () => {
  it("AC-5: 흡수 모션 첫 프레임 각도가 놓기 직전 각도와 같고 origin은 중앙이다", () => {
    const funnel = boardCard();
    const c = textCard();
    seed([c, funnel]);

    // 함 DOM 스텁 — runAbsorb가 querySelector로 찾는다.
    const funnelEl = document.createElement("div");
    funnelEl.setAttribute("data-card-id", "f");
    document.body.appendChild(funnelEl);
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
      () => [funnelEl];

    const calls: { el: Element; frames: Keyframe[] }[] = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      frames: Keyframe[],
    ) {
      calls.push({ el: this, frames });
      return { onfinish: null, cancel: vi.fn() } as unknown as Animation;
    } as typeof Element.prototype.animate;

    try {
      const { container } = wrap(<DraggableCard card={c} />);
      const el = root(container, "c1");
      fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 90, clientY: 0 });

      const before = rotateDeg(el);
      fireEvent.mouseUp(window, { clientX: 90, clientY: 0 });

      const cardCall = calls.find((x) => x.el === el);
      expect(cardCall).toBeTruthy();
      expect(String(cardCall!.frames[0].transform)).toContain(
        `rotate(${before}deg)`,
      );
      expect(el.style.transformOrigin).toBe("50% 50%");
    } finally {
      Element.prototype.animate = original;
      funnelEl.remove();
    }
  });
});
