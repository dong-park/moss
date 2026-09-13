import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Dock } from "@/components/workspace/Dock";
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
    sidebarDrag: null,
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
    expect(useWorkspace.getState().sidebarDrag).toBeNull();
  });

  it("드래그 중 독은 확대 상태를 유지한다(sidebarDrag가 채워진다)", async () => {
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    mountCanvasStub();
    renderDock();
    const memoBtn = screen.getByLabelText("메모");

    fireEvent.mouseDown(memoBtn, { clientX: 100, clientY: 700, button: 0 });
    fireEvent.mouseMove(document, { clientX: 130, clientY: 650 });

    expect(useWorkspace.getState().sidebarDrag).toEqual({
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
