import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Dock, cardOccludesDock } from "@/components/workspace/Dock";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

/**
 * FEAT-sticky-redesign n8: 독(Dock) — spec AC-1~AC-5 + Enter 생성(§8 접근성).
 */

let originalStorage: PropertyDescriptor | undefined;

/** 아이콘별 가짜 화면 좌표 — hover 확대 거리 계산 테스트용. 80px 간격으로 배치. */
const RECTS: Record<string, { left: number; width: number }> = {
  메모판: { left: 0, width: 72 },
  메모: { left: 80, width: 72 },
  파일함: { left: 160, width: 72 },
  펜: { left: 240, width: 72 },
  시그널스: { left: 320, width: 72 },
};

function mockRects() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const label = this.getAttribute("aria-label");
      const r = (label && RECTS[label]) || { left: 0, width: 72 };
      return {
        left: r.left,
        right: r.left + r.width,
        top: 0,
        bottom: 56,
        width: r.width,
        height: 56,
        x: r.left,
        y: 0,
        toJSON() {
          return {};
        },
      } as DOMRect;
    },
  );
}

function renderDock(props: Partial<React.ComponentProps<typeof Dock>> = {}) {
  return render(
    <I18nProvider locale="ko">
      <Dock {...props} />
    </I18nProvider>,
  );
}

/** 캔버스 스텁 — tryDrop이 elementFromPoint로 찾는 data-canvas-root 엘리먼트. */
function mountCanvasStub() {
  const el = document.createElement("div");
  el.setAttribute("data-canvas-root", "true");
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  // jsdom은 elementFromPoint를 구현하지 않는다 — tryDrop이 쓰므로 미리 자리를 만든다.
  if (!document.elementFromPoint) {
    Object.defineProperty(document, "elementFromPoint", {
      value: () => null,
      writable: true,
      configurable: true,
    });
  }
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    penMode: false,
    dockDrag: null,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  document.body.innerHTML = "";
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

describe("AC-1: 독 버튼 5개 + 구분선 1개", () => {
  it("메모판·메모·파일함·펜·시그널스 순서로 버튼 5개가 있다", () => {
    renderDock();
    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toBeTruthy();
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["메모판", "메모", "파일함", "펜", "시그널스"]);
    // 구분선 — aria-hidden div.
    expect(toolbar.querySelector("[aria-hidden]")).toBeTruthy();
  });

  it("사이드바 DOM이 없다", () => {
    const { container } = renderDock();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("2단계 리뷰 P1-1: 평상시 독 폭이 실측되어 토큰 폭 근사(±20px)이고 화면 가운데에 온다", () => {
    // 독 컨테이너(role=toolbar) 실제 렌더 폭을 260px로 가정(토큰 269px과 ±20px 이내).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const isToolbar = this.getAttribute("role") === "toolbar";
        const width = isToolbar ? 260 : 40;
        return {
          left: 0,
          right: width,
          top: 0,
          bottom: 56,
          width,
          height: 56,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      },
    );
    renderDock();
    const dock = screen.getByRole("toolbar");
    const expectedLeft = window.innerWidth / 2 - 260 / 2;
    expect(Math.abs(parseFloat(String(dock.style.left)) - expectedLeft)).toBeLessThan(1);
  });
});

describe("AC-2: 독 확대", () => {
  it("hover한 아이콘은 72px로, 이웃은 40~72px 사이로 커진다", () => {
    mockRects();
    renderDock();
    const dock = screen.getByRole("toolbar");
    const memoBtn = screen.getByLabelText("메모");
    const neighborBtn = screen.getByLabelText("메모판");

    fireEvent.mouseEnter(dock);
    // 메모 버튼 중심(80+36=116)에 마우스.
    fireEvent.mouseMove(dock, { clientX: 116 });

    const memoSpan = memoBtn.querySelector("span") as HTMLElement;
    const neighborSpan = neighborBtn.querySelector("span") as HTMLElement;
    expect(memoSpan.style.width).toBe("72px");
    const neighborWidth = parseFloat(neighborSpan.style.width);
    expect(neighborWidth).toBeGreaterThan(40);
    expect(neighborWidth).toBeLessThan(72);
  });

  it("마우스가 독을 벗어나면 40px로 돌아온다(200ms 이내 트랜지션)", () => {
    mockRects();
    renderDock();
    const dock = screen.getByRole("toolbar");
    const memoBtn = screen.getByLabelText("메모");

    fireEvent.mouseEnter(dock);
    fireEvent.mouseMove(dock, { clientX: 116 });
    fireEvent.mouseLeave(dock);

    const memoSpan = memoBtn.querySelector("span") as HTMLElement;
    expect(memoSpan.style.width).toBe("40px");
    // transition duration은 200ms 미만이어야 "200ms 안 복귀"를 만족한다.
    const match = /([\d.]+)ms/.exec(memoSpan.style.transition);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeLessThan(200);
  });

  it("동작 줄이기(prefers-reduced-motion)면 확대 애니메이션을 끄고 이름표만 보여준다", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mockRects();
    renderDock();
    const dock = screen.getByRole("toolbar");
    const memoBtn = screen.getByLabelText("메모");
    fireEvent.mouseEnter(dock);
    fireEvent.mouseMove(dock, { clientX: 116 });
    const memoSpan = memoBtn.querySelector("span") as HTMLElement;
    expect(memoSpan.style.width).toBe("40px");
    expect(memoSpan.style.transition).toBe("none");
    // 이름표는 그대로 보여야 한다.
    expect(memoBtn.textContent).toContain("메모");
  });
});

describe("AC-3: 독에서 끌어 만들기", () => {
  it("메모 아이콘을 끌어 캔버스에 놓으면 빈 메모가 생긴다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mountCanvasStub();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      document.querySelector("[data-canvas-root]"),
    );
    renderDock();
    const before = useWorkspace.getState().cards.length;
    const memoBtn = screen.getByLabelText("메모");

    fireEvent.mouseDown(memoBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 600 });
    fireEvent.mouseUp(document, { clientX: 300, clientY: 400 });
    await new Promise((r) => setTimeout(r, 10));

    const after = useWorkspace.getState().cards;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].kind).toBe("text");
  });

  it("메모판 아이콘을 끌어 놓으면 이름이 '새 메모판'인 틀이 생긴다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mountCanvasStub();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      document.querySelector("[data-canvas-root]"),
    );
    renderDock();
    const frameBtn = screen.getByLabelText("메모판");

    fireEvent.mouseDown(frameBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 600 });
    fireEvent.mouseUp(document, { clientX: 300, clientY: 400 });
    await new Promise((r) => setTimeout(r, 10));

    const frame = useWorkspace
      .getState()
      .cards.find((c) => c.kind === "frame");
    expect(frame).toBeDefined();
    expect(JSON.parse(frame!.content).name).toBe("새 메모판");
  });

  it("파일함 아이콘을 끌어 놓으면 함 카드와 빈 하위 캔버스가 생긴다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mountCanvasStub();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      document.querySelector("[data-canvas-root]"),
    );
    renderDock();
    const boardBtn = screen.getByLabelText("파일함");

    fireEvent.mouseDown(boardBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 600 });
    fireEvent.mouseUp(document, { clientX: 300, clientY: 400 });
    await new Promise((r) => setTimeout(r, 10));

    const board = useWorkspace
      .getState()
      .cards.find((c) => c.kind === "board");
    expect(board).toBeDefined();
    expect(board!.boardRef).toBeTruthy();
  });

  it("독 위에서 놓으면 아무것도 생기지 않는다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    // elementFromPoint가 캔버스가 아닌 dock 자신을 반환 — canvas-root 없음.
    vi.spyOn(document, "elementFromPoint").mockReturnValue(document.body);
    renderDock();
    const before = useWorkspace.getState().cards.length;
    const memoBtn = screen.getByLabelText("메모");

    fireEvent.mouseDown(memoBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 690 });
    fireEvent.mouseUp(document, { clientX: 105, clientY: 695 });
    await new Promise((r) => setTimeout(r, 10));

    expect(useWorkspace.getState().cards.length).toBe(before);
  });

  it("Esc를 누르면 아무것도 생기지 않는다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mountCanvasStub();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      document.querySelector("[data-canvas-root]"),
    );
    renderDock();
    const before = useWorkspace.getState().cards.length;
    const memoBtn = screen.getByLabelText("메모");

    fireEvent.mouseDown(memoBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 600 });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseUp(document, { clientX: 300, clientY: 400 });
    await new Promise((r) => setTimeout(r, 10));

    expect(useWorkspace.getState().cards.length).toBe(before);
    expect(useWorkspace.getState().dockDrag).toBeNull();
  });

  it("드래그 중 독은 확대 상태를 유지한다(dockDrag가 채워진다)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mountCanvasStub();
    renderDock();
    const memoBtn = screen.getByLabelText("메모");

    fireEvent.mouseDown(memoBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 130, clientY: 650 });

    expect(useWorkspace.getState().dockDrag).toEqual({
      toolId: "text",
      screenX: 130,
      screenY: 650,
    });

    fireEvent.mouseUp(document, { clientX: 130, clientY: 650 });
  });
});

describe("AC-4: 독의 펜과 시그널스", () => {
  it("펜 버튼을 누르면 펜 모드가 켜지고 aria-pressed가 true다", () => {
    renderDock();
    const penBtn = screen.getByLabelText("펜");
    expect(penBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(penBtn);
    expect(useWorkspace.getState().penMode).toBe(true);
    fireEvent.click(penBtn);
    expect(useWorkspace.getState().penMode).toBe(false);
  });

  it("시그널스 버튼을 누르면 onSignalsClick이 호출된다", () => {
    const onSignalsClick = vi.fn();
    renderDock({ onSignalsClick });
    fireEvent.click(screen.getByLabelText("시그널스"));
    expect(onSignalsClick).toHaveBeenCalledTimes(1);
  });
});

describe("2단계 리뷰 P1-2: cardOccludesDock 순수 함수", () => {
  const dockRect = { left: 100, right: 200, top: 500, bottom: 556 };
  const viewport = { x: 0, y: 0, scale: 1 };

  it("카드가 독 사각형과 겹치면 true", () => {
    const card = { id: "c1", kind: "text" as const, x: 50, y: 480, width: 200, height: 100, content: "" };
    expect(cardOccludesDock(card, viewport, dockRect)).toBe(true);
  });

  it("카드가 독과 안 겹치면 false", () => {
    const card = { id: "c1", kind: "text" as const, x: 800, y: 800, width: 100, height: 100, content: "" };
    expect(cardOccludesDock(card, viewport, dockRect)).toBe(false);
  });

  it("판(frame) 카드는 겹쳐도 판정 대상이 아니다(배경 레이어)", () => {
    const card = { id: "f1", kind: "frame" as const, x: 50, y: 480, width: 400, height: 300, content: "" };
    expect(cardOccludesDock(card, viewport, dockRect)).toBe(false);
  });

  it("viewport 스케일/오프셋이 반영된다", () => {
    const card = { id: "c1", kind: "text" as const, x: 1000, y: 1000, width: 50, height: 50, content: "" };
    // left = -900+1000=100..150(dockRect.left..right 안), top = -450+1000=550..600(dockRect.top..bottom 안).
    const shifted = { x: -900, y: -450, scale: 1 };
    expect(cardOccludesDock(card, shifted, dockRect)).toBe(true);
  });
});

describe("AC-5: 가려진 메모가 있으면 독이 옅어진다", () => {
  it("독과 겹치는 카드가 있으면 불투명도 0.6, hover 시 1로 돌아온다", () => {
    mockRects();
    useWorkspace.setState({
      cards: [
        {
          id: "c1",
          kind: "text",
          x: 0,
          y: 0,
          width: 400,
          height: 400,
          content: "",
        },
      ],
      viewport: { x: 0, y: 0, scale: 1 },
    });
    renderDock();
    const dock = screen.getByRole("toolbar");
    expect(dock.style.opacity).toBe("0.6");
    fireEvent.mouseEnter(dock);
    expect(dock.style.opacity).toBe("1");
  });

  it("겹치는 메모가 없으면 불투명도는 1이다", () => {
    mockRects();
    renderDock();
    const dock = screen.getByRole("toolbar");
    expect(dock.style.opacity).toBe("1");
  });

  it("2단계 리뷰 P1-2: 시그널스가 열려 독 위치가 바뀌면 가림 판정을 다시 한다", () => {
    // 독(role=toolbar) 실제 위치를 toolbarLeft로 흉내낸다 — signalsOpen이 바뀔 때
    // 독이 옮겨간 것으로 간주하고 그 시점 rect로 재판정하는지 확인한다.
    let toolbarLeft = 1000; // 카드(x:0~100)와 안 겹치는 위치에서 시작.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const isToolbar = this.getAttribute("role") === "toolbar";
        const left = isToolbar ? toolbarLeft : 0;
        const width = isToolbar ? 260 : 72;
        return {
          left,
          right: left + width,
          top: 0,
          bottom: 56,
          width,
          height: 56,
          x: left,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      },
    );
    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 100, height: 100, content: "" }],
      viewport: { x: 0, y: 0, scale: 1 },
    });
    const { rerender } = renderDock({ signalsOpen: false });
    expect(screen.getByRole("toolbar").style.opacity).toBe("1");

    toolbarLeft = 0; // 시그널스가 열리며 독이 카드와 겹치는 위치로 이동했다고 가정.
    rerender(
      <I18nProvider locale="ko">
        <Dock signalsOpen />
      </I18nProvider>,
    );
    expect(screen.getByRole("toolbar").style.opacity).toBe("0.6");
  });

  it("n10 브라우저 결함1: store 좌표(viewport 수식)로는 안 겹쳐 보여도 실제 렌더된 카드 DOM이 독과 겹치면 옅어진다", () => {
    // 카드의 저장 좌표(x:5000)는 독(화면 0..72)과 전혀 겹치지 않는 걸로 계산된다 —
    // 그런데도 실제로 화면에 렌더된 카드 엘리먼트(캔버스 오프셋·실측 높이 등 어떤
    // 이유로든)가 독과 겹친다면 옅어져야 한다(실측 DOM 우선, 순수 수식은 폴백).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute("data-card-id") === "c1") {
          return {
            left: 10,
            right: 60,
            top: 10,
            bottom: 66,
            width: 50,
            height: 56,
            x: 10,
            y: 10,
            toJSON() {
              return {};
            },
          } as DOMRect;
        }
        if (this.getAttribute("role") === "toolbar") {
          return {
            left: 0,
            right: 72,
            top: 0,
            bottom: 56,
            width: 72,
            height: 56,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          } as DOMRect;
        }
        return {
          left: 0,
          right: 72,
          top: 0,
          bottom: 56,
          width: 72,
          height: 56,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      },
    );
    // 캔버스에 실제로 렌더될 카드 DOM을 흉내낸다(Canvas가 만드는 [data-card-id]).
    const cardEl = document.createElement("div");
    cardEl.setAttribute("data-card-id", "c1");
    document.body.appendChild(cardEl);

    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 5000, y: 5000, width: 100, height: 100, content: "" }],
      viewport: { x: 0, y: 0, scale: 1 },
    });
    renderDock();
    expect(screen.getByRole("toolbar").style.opacity).toBe("0.6");
  });
});

describe("접근성: Enter로 화면 가운데에 생성", () => {
  it("메모 버튼에 Enter(클릭)를 누르면 화면 가운데에 메모가 생긴다", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    renderDock();
    const before = useWorkspace.getState().cards.length;
    const memoBtn = screen.getByLabelText("메모");
    memoBtn.focus();
    fireEvent.click(memoBtn);
    await new Promise((r) => setTimeout(r, 10));
    const after = useWorkspace.getState().cards;
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].kind).toBe("text");
  });

  it("메모판 버튼 클릭(Enter) → 화면 가운데에 메모판 생성", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    renderDock();
    const frameBtn = screen.getByLabelText("메모판");
    fireEvent.click(frameBtn);
    await new Promise((r) => setTimeout(r, 10));
    const frame = useWorkspace
      .getState()
      .cards.find((c) => c.kind === "frame");
    expect(frame).toBeDefined();
  });
});
