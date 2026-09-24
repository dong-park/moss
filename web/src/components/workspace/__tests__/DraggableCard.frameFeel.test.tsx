import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { MAX_TILT_DEG } from "@/components/workspace/dragTilt";
import { memoBaseTransform } from "@/components/workspace/memoVariety";

/**
 * FEAT-frame-feel — 메모판을 끌 때의 손맛:
 * T1 무거운 들기(AC-1·2), T2 넣기 강조(AC-3·4), T3 "착"(AC-5·6),
 * T4 따라 흔들림(AC-7·8·9·13), T5 reduced-motion(AC-11).
 * Milkdown은 형제 테스트와 동일하게 textarea stub 처리.
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

function frame(over: Partial<Card> = {}): Card {
  return {
    id: "f1",
    kind: "frame",
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    content: '{"name":"판"}',
    ...over,
  };
}

function memo(over: Partial<Card> = {}): Card {
  return {
    id: "m1",
    kind: "text",
    x: 1000,
    y: 1000,
    width: 100,
    height: 100,
    content: "",
    ...over,
  };
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
    dropTargetFrameId: null,
    wobbleFrameId: null,
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

const frames = (n: number) => vi.advanceTimersByTime(16 * n);

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
    () => [];
  stubMatchMedia(false);
  seed([]);
});

afterEach(() => {
  vi.useRealTimers();
  fireEvent.mouseUp(window);
  vi.restoreAllMocks();
});

describe("FEAT-frame-feel T1 · 무거운 들기", () => {
  it("AC-1·2: 판은 들려도 transform이 없고 그림자만 깊어진다", () => {
    const f = frame();
    seed([f]);
    const { container } = wrap(<DraggableCard card={f} />);
    const el = root(container, "f1");

    expect(el.style.transform).toBe("");
    expect(el.style.boxShadow).toBe("");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 20 });

    expect(el.style.transform).toBe("");
    expect(el.style.boxShadow).toBe("var(--shadow-frame-lift)");

    fireEvent.mouseUp(window, { clientX: 40, clientY: 20 });
    expect(el.style.boxShadow).toBe("");
    expect(el.style.transform).toBe("");
  });
});

describe("FEAT-frame-feel T2 · 넣기 강조", () => {
  it("AC-3: 놓으면 속할 판에 강조가 켜지고, 드롭 뒤 frameId와 일치한다", () => {
    const f = frame();
    const m = memo();
    seed([f, m]);
    const { container } = wrap(
      <>
        <DraggableCard card={f} />
        <DraggableCard card={m} />
      </>,
    );
    const el = root(container, "m1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    // 메모 중심(1050,1050)을 판 안(중심 180,170)으로 끈다.
    fireEvent.mouseMove(window, { clientX: -870, clientY: -880 });
    expect(useWorkspace.getState().dropTargetFrameId).toBe("f1");

    fireEvent.mouseUp(window, { clientX: -870, clientY: -880 });
    const after = useWorkspace.getState().cards.find((c) => c.id === "m1")!;
    expect(after.frameId).toBe("f1");
    expect(useWorkspace.getState().dropTargetFrameId).toBeNull();
  });

  it("AC-3: 판이 겹치면 소속 규칙과 같은 판(배열 뒤)이 이긴다", () => {
    const f1 = frame({ id: "f1" });
    // f2가 겹치고 배열 뒤 — findOwningFrame은 뒤 판을 고른다.
    const f2 = frame({ id: "f2", x: 100, y: 60 });
    const m = memo();
    seed([f1, f2, m]);
    const { container } = wrap(<DraggableCard card={m} />);
    const el = root(container, "m1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    // f2 중심(260,170) 안으로 — 두 판 모두 포함하는 교집합.
    fireEvent.mouseMove(window, { clientX: -790, clientY: -880 });
    expect(useWorkspace.getState().dropTargetFrameId).toBe("f2");

    fireEvent.mouseUp(window, { clientX: -790, clientY: -880 });
    expect(
      useWorkspace.getState().cards.find((c) => c.id === "m1")!.frameId,
    ).toBe("f2");
  });

  it("AC-4: 판 밖으로 나가면 강조가 꺼지고, 드롭이 끝나면 남지 않는다", () => {
    const f = frame();
    const m = memo();
    seed([f, m]);
    const { container } = wrap(<DraggableCard card={m} />);
    const el = root(container, "m1");

    fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: -870, clientY: -880 });
    expect(useWorkspace.getState().dropTargetFrameId).toBe("f1");

    // 판 밖으로 계속 끈다 — 강조 꺼짐.
    fireEvent.mouseMove(window, { clientX: 400, clientY: 400 });
    expect(useWorkspace.getState().dropTargetFrameId).toBeNull();

    fireEvent.mouseUp(window, { clientX: 400, clientY: 400 });
    expect(useWorkspace.getState().dropTargetFrameId).toBeNull();
  });

  it("AC-4: 휴지통 위로 올리면 판 강조가 꺼진다", () => {
    const f = frame();
    const m = memo();
    seed([f, m]);
    const { container } = wrap(<DraggableCard card={m} />);
    const el = root(container, "m1");
    const trashEl = document.createElement("div");
    trashEl.setAttribute("data-dock-id", "trash");
    document.body.appendChild(trashEl);
    try {
      fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: -870, clientY: -880 });
      expect(useWorkspace.getState().dropTargetFrameId).toBe("f1");

      (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint =
        () => [trashEl];
      fireEvent.mouseMove(window, { clientX: -860, clientY: -870 });
      expect(useWorkspace.getState().dropTargetFrameId).toBeNull();
      expect(useWorkspace.getState().dropTargetTrash).toBe(true);

      fireEvent.mouseUp(window, { clientX: -860, clientY: -870 });
    } finally {
      trashEl.remove();
    }
  });
});

describe("FEAT-frame-feel T3 · '착' 모션", () => {
  /** Element.animate 호출을 캡처 — jsdom엔 WAAPI가 없다. */
  function captureAnimate() {
    const calls: { el: Element; options?: KeyframeAnimationOptions }[] = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      _frames: Keyframe[],
      options?: number | KeyframeAnimationOptions,
    ) {
      calls.push({
        el: this,
        options: typeof options === "object" ? options : undefined,
      });
      return { onfinish: null, cancel: vi.fn() } as unknown as Animation;
    } as typeof Element.prototype.animate;
    return { calls, restore: () => (Element.prototype.animate = original) };
  }

  it("AC-5·6: 새로 이 판에 속한 메모만 400ms 안에 '착'한다", () => {
    const cap = captureAnimate();
    try {
      const f = frame();
      const m = memo();
      seed([f, m]);
      const { container } = wrap(<DraggableCard card={m} />);
      const el = root(container, "m1");

      fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: -870, clientY: -880 });
      fireEvent.mouseUp(window, { clientX: -870, clientY: -880 });

      const snap = cap.calls.find((c) => c.el === el);
      expect(snap).toBeTruthy();
      expect(snap!.options?.duration).toBeLessThanOrEqual(400);
    } finally {
      cap.restore();
    }
  });

  it("AC-5: 같은 판 안에서 자리만 옮긴 메모는 '착'하지 않는다", () => {
    const cap = captureAnimate();
    try {
      const f = frame();
      const m = memo({ id: "m1", x: 100, y: 100, frameId: "f1" });
      seed([f, m]);
      const { container } = wrap(<DraggableCard card={m} />);
      const el = root(container, "m1");

      fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 30, clientY: 30 });
      fireEvent.mouseUp(window, { clientX: 30, clientY: 30 });

      expect(cap.calls.some((c) => c.el === el)).toBe(false);
      expect(
        useWorkspace.getState().cards.find((c) => c.id === "m1")!.frameId,
      ).toBe("f1");
    } finally {
      cap.restore();
    }
  });

  it("판 드래그가 새로 덮은 메모도 '착'한다", () => {
    const cap = captureAnimate();
    try {
      const f = frame();
      const m = memo();
      seed([f, m]);
      const { container } = wrap(
        <>
          <DraggableCard card={f} />
          <DraggableCard card={m} />
        </>,
      );
      const fEl = root(container, "f1");
      const mEl = root(container, "m1");

      fireEvent.mouseDown(fEl, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 800, clientY: 900 });
      fireEvent.mouseUp(window, { clientX: 800, clientY: 900 });

      expect(
        useWorkspace.getState().cards.find((c) => c.id === "m1")!.frameId,
      ).toBe("f1");
      expect(cap.calls.some((c) => c.el === mEl)).toBe(true);
    } finally {
      cap.restore();
    }
  });
});

describe("FEAT-frame-feel T4 · 따라 흔들림", () => {
  it("AC-7·8: 오른쪽으로 끌면 멤버가 윗변 축으로 시계 반대(-)로 처진다", () => {
    vi.useFakeTimers();
    const f = frame();
    const m = memo({ id: "m1", x: 40, y: 40, frameId: "f1" });
    seed([f, m]);
    const { container } = wrap(
      <>
        <DraggableCard card={f} />
        <DraggableCard card={m} />
      </>,
    );
    const fEl = root(container, "f1");
    const mEl = root(container, "m1");
    // 윗변 축 확인을 위해 멤버 높이를 100으로 둔다(jsdom rect는 0).
    mEl.getBoundingClientRect = () =>
      ({ height: 100, width: 100, top: 0, left: 0 }) as DOMRect;

    fireEvent.mouseDown(fEl, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 0 });
    frames(1);

    expect(useWorkspace.getState().wobbleFrameId).toBe("f1");
    // 멤버는 흔들림용 transform(var(--tilt) 기반)을 쓴다.
    expect(mEl.style.transform).toContain("var(--tilt");
    const deg = parseFloat(mEl.style.getPropertyValue("--tilt"));
    expect(deg).toBeLessThan(0);
    expect(Math.abs(deg)).toBeLessThanOrEqual(MAX_TILT_DEG);
    // 축 = 윗변 가운데: --px=0, --py=-높이/2.
    expect(mEl.style.getPropertyValue("--px")).toBe("0px");
    expect(mEl.style.getPropertyValue("--py")).toBe("-50px");

    fireEvent.mouseUp(window, { clientX: 120, clientY: 0 });
    vi.useRealTimers();
    // AC-9: 안착 스프링이 끝나면 흔들림 변수가 모두 지워지고 고유 각도로 선다.
    return waitFor(
      () => {
        expect(mEl.style.getPropertyValue("--tilt")).toBe("");
        expect(mEl.style.transform).toBe(memoBaseTransform(m, false));
      },
      { timeout: 3000 },
    );
  });

  it("AC-13: 멤버가 31장 이상이면 흔들리는 메모는 30장 이하다", () => {
    vi.useFakeTimers();
    const f = frame({ width: 2000, height: 2000 });
    const members: Card[] = [];
    for (let i = 0; i < 35; i++) {
      members.push(
        memo({ id: `m${i}`, x: 40 + i * 30, y: 40, width: 20, height: 20, frameId: "f1" }),
      );
    }
    seed([f, ...members]);
    const { container } = wrap(
      <>
        <DraggableCard card={f} />
        {members.map((m) => (
          <DraggableCard key={m.id} card={m} />
        ))}
      </>,
    );
    const fEl = root(container, "f1");

    fireEvent.mouseDown(fEl, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 40, clientY: 0 });

    const wobbling = members.filter((m) =>
      root(container, m.id).style.getPropertyValue("--tilt"),
    );
    expect(wobbling.length).toBeLessThanOrEqual(30);

    fireEvent.mouseUp(window, { clientX: 40, clientY: 0 });
    vi.useRealTimers();
  });

  it("AC-10: 흔들림 갱신은 스토어에 매 프레임 쓰지 않는다(시작에 한 번만)", () => {
    vi.useFakeTimers();
    const f = frame();
    const m = memo({ id: "m1", x: 40, y: 40, frameId: "f1" });
    seed([f, m]);
    const { container } = wrap(
      <>
        <DraggableCard card={f} />
        <DraggableCard card={m} />
      </>,
    );
    const fEl = root(container, "f1");

    let prev: string | null = null;
    let starts = 0;
    const unsub = useWorkspace.subscribe((s) => {
      if (prev === null && s.wobbleFrameId === "f1") starts++;
      prev = s.wobbleFrameId;
    });

    fireEvent.mouseDown(fEl, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 0 });
    for (let i = 1; i <= 5; i++) {
      fireEvent.mouseMove(window, { clientX: 12 + i * 10, clientY: 0 });
    }
    unsub();
    expect(starts).toBe(1);

    fireEvent.mouseUp(window, { clientX: 70, clientY: 0 });
    vi.useRealTimers();
  });
});

describe("FEAT-frame-feel T5 · reduced-motion", () => {
  it("AC-11: reduced-motion이면 흔들림·'착'은 없고 강조·그림자는 남는다", () => {
    stubMatchMedia(true);
    const cap = (() => {
      const calls: Element[] = [];
      const original = Element.prototype.animate;
      Element.prototype.animate = function (this: Element) {
        calls.push(this);
        return { onfinish: null, cancel: vi.fn() } as unknown as Animation;
      } as typeof Element.prototype.animate;
      return { calls, restore: () => (Element.prototype.animate = original) };
    })();
    try {
      const f = frame();
      const m = memo({ id: "m1", x: 40, y: 40, frameId: "f1" });
      const c = memo({ id: "m2", x: 40, y: 300, width: 100, height: 100 });
      seed([f, m, c]);
      const { container } = wrap(
        <>
          <DraggableCard card={f} />
          <DraggableCard card={m} />
          <DraggableCard card={c} />
        </>,
      );
      const mEl = root(container, "m1");

      // 판 드래그 — 흔들림 없음, 그림자만 깊어짐.
      const fEl = root(container, "f1");
      fireEvent.mouseDown(fEl, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 40, clientY: 20 });
      expect(useWorkspace.getState().wobbleFrameId).toBeNull();
      expect(mEl.style.getPropertyValue("--tilt")).toBe("");
      expect(fEl.style.boxShadow).toBe("var(--shadow-frame-lift)");
      fireEvent.mouseUp(window, { clientX: 40, clientY: 20 });

      // 메모 드래그 — 강조는 켜지되 "착" 애니메이션은 없다.
      const cEl = root(container, "m2");
      fireEvent.mouseDown(cEl, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 90, clientY: -180 });
      expect(useWorkspace.getState().dropTargetFrameId).toBe("f1");
      fireEvent.mouseUp(window, { clientX: 90, clientY: -180 });
      expect(cap.calls).not.toContain(cEl);
    } finally {
      cap.restore();
    }
  });
});
