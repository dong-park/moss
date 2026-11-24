import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/Provider";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { DraggableCard } from "@/components/workspace/DraggableCard";
import { parseStrokes, serializeHandwriting, serializeStrokes } from "@/state/cardContent";
import { MARKER_COLOR_VALUE, MARKER_WIDTH_UNITS } from "@/state/marker/tokens";

/**
 * wall-marker n5 — 포스트잇 위 마카 획 (T4·T7·T8·T15, D2·D4·D5·D7).
 *
 * 포스트잇 기울기는 id 해시로 정해져 테스트가 값을 고를 수 없다 — 변환이 읽는
 * `cardRotationDeg`만 바꿔 5도로 고정한다. 그 밖(포인터·스토어·Dexie)은 실경로다.
 * Milkdown은 jsdom에서 불안정해 MarkdownEditor를 모킹한다(heldTool 테스트와 같은 전략).
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({ value }: { value: string }) => (
    <textarea data-testid="inline-editor" defaultValue={value} />
  ),
  ExpandedMarkdownEditor: (props: { value: string }) => (
    <div data-testid="expanded-editor-wrap">{props.value}</div>
  ),
}));

let mockDeg: number | null = 0;
vi.mock("@/components/workspace/memoVariety", async (orig) => {
  const actual = await orig<typeof import("@/components/workspace/memoVariety")>();
  return {
    ...actual,
    cardRotationDeg: (id: string, kind: string) =>
      mockDeg !== null ? mockDeg : actual.cardRotationDeg(id, kind),
  };
});

const W = 300;
const CENTER = { x: 500, y: 400 };

function wrap(ui: ReactNode) {
  return render(<I18nProvider locale="ko">{ui}</I18nProvider>);
}

/** 앱처럼 스토어의 카드를 따라간다 — overlay가 바뀌면 다시 그린다. */
function Bound({ id }: { id: string }) {
  const card = useWorkspace((s) => s.cards.find((c) => c.id === id));
  return card ? <DraggableCard card={card} /> : null;
}

function textCard(over: Partial<Card> = {}): Card {
  return { id: "t1", kind: "text", x: 10, y: 20, width: W, content: "안녕", ...over };
}

/** 회전각·줌을 반영한 카드 껍데기의 화면 상자를 jsdom에 흉내 낸다. */
function mockBox(deg: number, scale = 1) {
  const rad = (Math.abs(deg) * Math.PI) / 180;
  const side = W * (Math.cos(rad) + Math.sin(rad)) * scale;
  const rect = {
    left: CENTER.x - side / 2,
    top: CENTER.y - side / 2,
    width: side,
    height: side,
    right: CENTER.x + side / 2,
    bottom: CENTER.y + side / 2,
    x: CENTER.x - side / 2,
    y: CENTER.y - side / 2,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset?.cardId ? rect : ({ left: 0, top: 0, width: 0, height: 0 } as DOMRect);
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(W);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(W);
}

function fire(
  target: Element,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  init: { x: number; y: number; id?: number; pointerType?: string },
) {
  const ev = createEvent[type](target, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
  });
  Object.defineProperty(ev, "pointerId", { value: init.id ?? 1 });
  Object.defineProperty(ev, "pointerType", { value: init.pointerType ?? "mouse" });
  fireEvent(target, ev);
}

const rootOf = (c: HTMLElement) => c.querySelector('[data-card-id="t1"]') as HTMLElement;
const layerOf = (c: HTMLElement) =>
  c.querySelector("svg[data-drawing-layer]") as SVGSVGElement;
const overlayOf = (id = "t1") =>
  useWorkspace.getState().cards.find((c) => c.id === id)?.overlay ?? "";

/** 화면 한 점을 지나는 한 획을 그린다. */
function stroke(
  target: Element,
  pts: Array<[number, number]>,
  opts: { pointerType?: string; id?: number } = {},
) {
  const [first, ...rest] = pts;
  fire(target, "pointerDown", { x: first[0], y: first[1], ...opts });
  for (const [x, y] of rest) fire(target, "pointerMove", { x, y, ...opts });
  const last = pts[pts.length - 1];
  fire(target, "pointerUp", { x: last[0], y: last[1], ...opts });
}

beforeEach(() => {
  mockDeg = 0;
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
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
    lastMarkerColor: "black",
    markerWidth: "thin",
    markerUndoStack: [],
    markerRedoStack: [],
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
});

describe("포스트잇 위 마카 획", () => {
  it("빨강 마카로 포스트잇 위를 끌면 overlay path가 빨강이다 (T4)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "red" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    stroke(layerOf(container), [
      [450, 400],
      [500, 410],
      [550, 400],
    ]);

    const strokes = parseStrokes(overlayOf());
    expect(strokes).toHaveLength(1);
    expect(strokes[0].color).toBe("red");
    expect(strokes[0].width).toBe("thin");
    // 중심(500,400) = 자기 좌표 (150,150)
    expect(strokes[0].points[0]).toEqual({ x: 100, y: 150 });
    expect(strokes[0].points[2]).toEqual({ x: 200, y: 150 });
    // 그린 직후 앞면에 보인다 — 빨강, 가는 선
    const line = container.querySelector("polyline")!;
    expect(line.getAttribute("stroke")).toBe(MARKER_COLOR_VALUE.red);
    expect(line.getAttribute("stroke-width")).toBe(String(MARKER_WIDTH_UNITS.thin));
  });

  it("든 마카의 굵기 이름이 획에 실린다", () => {
    const c = textCard();
    useWorkspace.setState({
      cards: [c],
      heldTool: { kind: "marker", color: "blue" },
      markerWidth: "thick",
    });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    stroke(layerOf(container), [
      [450, 400],
      [550, 400],
    ]);
    const [s] = parseStrokes(overlayOf());
    expect(s.color).toBe("blue");
    expect(s.width).toBe("thick");
  });

  it("5도 기운 포스트잇에서 화면 수평선이 자기 좌표에서 기운 선으로 저장된다", () => {
    mockDeg = 5;
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "black" } });
    mockBox(5);
    const { container } = wrap(<Bound id="t1" />);

    stroke(layerOf(container), [
      [400, 400],
      [600, 400],
    ]);

    const [s] = parseStrokes(overlayOf());
    const [a, b] = s.points;
    expect(a.y).toBeGreaterThan(b.y); // 화면에선 수평, 포스트잇 기준으론 기운 선
    expect(a.y - b.y).toBeCloseTo(200 * Math.sin((5 * Math.PI) / 180), 0);
    expect(a.x).toBeCloseTo(150 - 100 * Math.cos((5 * Math.PI) / 180), 0);
  });

  it("줌이 걸려 있어도 자기 좌표는 줌과 무관하다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "black" } });
    mockBox(0, 2);
    const { container } = wrap(<Bound id="t1" />);
    stroke(layerOf(container), [
      [400, 400],
      [600, 400],
    ]);
    const [s] = parseStrokes(overlayOf());
    // 화면 200px = 자기 좌표 100
    expect(s.points[0]).toEqual({ x: 100, y: 150 });
    expect(s.points[1]).toEqual({ x: 200, y: 150 });
  });

  it("포스트잇 x,y를 바꿔도 overlay는 같다 — 획이 따라간다 (T4)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "red" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    stroke(layerOf(container), [
      [450, 400],
      [550, 400],
    ]);
    const before = overlayOf();
    expect(before).not.toBe("");

    act(() => useWorkspace.getState().moveCard("t1", 600, 700));

    const moved = useWorkspace.getState().cards.find((x) => x.id === "t1")!;
    expect([moved.x, moved.y]).toEqual([600, 700]);
    expect(moved.overlay).toBe(before);
  });

  it("포스트잇 가장자리에서 잘린다 — 밖은 저장하지 않는다 (D4)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "green" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    // 중심에서 오른쪽으로 포스트잇 반폭(150)을 훨씬 넘어 끌기
    stroke(layerOf(container), [
      [550, 400],
      [700, 400],
      [900, 400],
    ]);
    const strokes = parseStrokes(overlayOf());
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      for (const p of s.points) {
        expect(p.x).toBeLessThanOrEqual(W);
        expect(p.x).toBeGreaterThanOrEqual(0);
      }
    }
    const lastPoint = strokes[0].points[strokes[0].points.length - 1];
    expect(lastPoint.x).toBe(W);
  });

  it("마카를 든 동안 포스트잇은 움직이지 않고 끈 자리에 획이 생긴다 (T7)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "black" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    fireEvent.mouseDown(rootOf(container), { button: 0, clientX: 450, clientY: 400 });
    stroke(layerOf(container), [
      [450, 400],
      [520, 430],
    ]);
    fireEvent.mouseUp(window, { clientX: 520, clientY: 430 });

    const after = useWorkspace.getState().cards.find((x) => x.id === "t1")!;
    expect([after.x, after.y]).toEqual([10, 20]);
    expect(useWorkspace.getState().editingId).toBeNull();
    expect(parseStrokes(after.overlay ?? "")).toHaveLength(1);
  });
});

describe("천으로 문지르기 · 옛 펜 획", () => {
  const red = {
    points: [
      { x: 10, y: 150 },
      { x: 290, y: 150 },
    ],
    color: "red" as const,
    width: "mid" as const,
  };

  it("천으로 가운데를 문지르면 획이 두 조각으로 바뀌고 색·굵기는 유지된다 (T8)", () => {
    const overlay = JSON.stringify({ paths: [red] });
    const c = textCard({ overlay });
    useWorkspace.setState({ cards: [c], heldTool: { kind: "cloth" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    // 자기 좌표 (150,150) = 화면 중심
    stroke(layerOf(container), [
      [CENTER.x, CENTER.y],
      [CENTER.x + 2, CENTER.y],
    ]);

    const strokes = parseStrokes(overlayOf());
    expect(strokes).toHaveLength(2);
    for (const s of strokes) {
      expect(s.color).toBe("red");
      expect(s.width).toBe("mid");
    }
    // 가운데 구간이 비었다
    const xs = strokes.flatMap((s) => s.points.map((p) => p.x));
    expect(xs.some((x) => x > 140 && x < 160)).toBe(false);
  });

  it("문지르지 않은 자리의 획은 그대로 남는다 (T8)", () => {
    const overlay = JSON.stringify({ paths: [red] });
    const c = textCard({ overlay });
    useWorkspace.setState({ cards: [c], heldTool: { kind: "cloth" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    // 자기 좌표 (150,40) — 획에서 멀다
    stroke(layerOf(container), [
      [CENTER.x, CENTER.y - 110],
      [CENTER.x + 2, CENTER.y - 110],
    ]);
    expect(overlayOf()).toBe(overlay);
  });

  it("색·굵기 없는 옛 overlay가 검정·가는 선으로 앞면에 보인다 (T15)", () => {
    const old = serializeHandwriting({
      paths: [
        [
          { x: 20, y: 30 },
          { x: 80, y: 90 },
        ],
      ],
    });
    const c = textCard({ overlay: old });
    useWorkspace.setState({ cards: [c] });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    const line = container.querySelector("polyline")!;
    expect(line.getAttribute("stroke")).toBe(MARKER_COLOR_VALUE.black);
    expect(line.getAttribute("stroke-width")).toBe(String(MARKER_WIDTH_UNITS.thin));
    expect(line.getAttribute("points")).toBe("20,30 80,90");
  });
});

describe("안 들고 펜으로 그리기 (D5)", () => {
  it("안 들었어도 태블릿 펜이 닿으면 마지막 마카로 그린다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], lastMarkerColor: "blue" });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    fire(rootOf(container), "pointerDown", { x: 450, y: 400, pointerType: "pen" });
    fire(layerOf(container), "pointerMove", { x: 500, y: 420, pointerType: "pen" });
    fire(layerOf(container), "pointerUp", { x: 550, y: 400, pointerType: "pen" });

    const strokes = parseStrokes(overlayOf());
    expect(strokes).toHaveLength(1);
    expect(strokes[0].color).toBe("blue");
    // 들지 않았다 — 도구 상태는 그대로
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("안 들었을 때 손가락·마우스는 그리지 않는다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], lastMarkerColor: "blue" });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    for (const pointerType of ["touch", "mouse"]) {
      fire(rootOf(container), "pointerDown", { x: 450, y: 400, pointerType });
      fire(rootOf(container), "pointerMove", { x: 500, y: 420, pointerType });
      fire(rootOf(container), "pointerUp", { x: 550, y: 400, pointerType });
    }
    expect(overlayOf()).toBe("");
    // 펜이 아니면 레이어도 마운트되지 않는다.
    expect(layerOf(container)).toBeNull();
  });

  it("레이어는 안 든 동안 pointer-events:none이라 손가락은 포스트잇으로 통과한다", () => {
    const c = textCard({
      overlay: serializeHandwriting({ paths: [[{ x: 1, y: 1 }, { x: 9, y: 9 }]] }),
    });
    useWorkspace.setState({ cards: [c] });
    const { container } = wrap(<Bound id="t1" />);
    expect(layerOf(container).style.pointerEvents).toBe("none");
  });

  it("글 제목을 고치는 중에는 펜이 그리지 않는다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], editingId: "t1" });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    fire(rootOf(container), "pointerDown", { x: 450, y: 400, pointerType: "pen" });
    fire(rootOf(container), "pointerMove", { x: 500, y: 420, pointerType: "pen" });
    fire(rootOf(container), "pointerUp", { x: 550, y: 400, pointerType: "pen" });
    expect(overlayOf()).toBe("");
    // 그리지 않을 입력이라 레이어도 마운트되지 않는다.
    expect(layerOf(container)).toBeNull();
  });
});

describe("그리기 레이어는 필요할 때만 마운트한다 (W11)", () => {
  it("빈 overlay이고 아무것도 안 든 포스트잇에는 그리기 레이어(svg)가 없다", () => {
    useWorkspace.setState({ cards: [textCard()], heldTool: null });
    const { container } = wrap(<Bound id="t1" />);
    expect(layerOf(container)).toBeNull();
  });

  it("마카를 들면 레이어가 마운트되고, 내려놓아도 획이 남아 있으면 그대로다", () => {
    useWorkspace.setState({ cards: [textCard()], heldTool: { kind: "marker", color: "red" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    expect(layerOf(container)).not.toBeNull();
    stroke(layerOf(container), [
      [450, 400],
      [550, 400],
    ]);
    act(() => useWorkspace.getState().releaseTool());
    expect(layerOf(container)).not.toBeNull();
    expect(parseStrokes(overlayOf())).toHaveLength(1);
  });

  it("획이 있는 포스트잇은 처음부터 레이어가 보인다(옛 메모 펜 획 포함)", () => {
    useWorkspace.setState({
      cards: [textCard({ overlay: serializeHandwriting({ paths: [[{ x: 1, y: 1 }, { x: 9, y: 9 }]] }) })],
      heldTool: null,
    });
    const { container } = wrap(<Bound id="t1" />);
    expect(layerOf(container)).not.toBeNull();
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });

  it("안 들고 펜을 대면 그때 마운트되어 그 획이 그려진다", () => {
    useWorkspace.setState({ cards: [textCard()], heldTool: null });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    expect(layerOf(container)).toBeNull();

    fire(rootOf(container), "pointerDown", { x: 450, y: 400, pointerType: "pen" });
    expect(layerOf(container)).not.toBeNull();
    fire(layerOf(container), "pointerMove", { x: 500, y: 420, pointerType: "pen" });
    fire(layerOf(container), "pointerUp", { x: 550, y: 400, pointerType: "pen" });
    expect(parseStrokes(overlayOf())).toHaveLength(1);
  });
});

describe("기록·유실", () => {
  it("한 획이 기록 한 항목이고 ⌘Z로 그 획만 되돌아간다 (T10 포스트잇 부분)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "red" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    stroke(layerOf(container), [
      [450, 400],
      [550, 400],
    ]);
    const first = overlayOf();
    stroke(layerOf(container), [
      [450, 450],
      [550, 450],
    ]);
    expect(parseStrokes(overlayOf())).toHaveLength(2);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(2);

    act(() => useWorkspace.getState().markerUndo());
    expect(overlayOf()).toBe(first);
  });

  it("새 획은 id를 싣고 쓴다 — 되돌리기가 그 id로 내 획만 고른다 (W6)", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "red" } });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);
    stroke(layerOf(container), [
      [450, 400],
      [550, 400],
    ]);
    stroke(layerOf(container), [
      [450, 450],
      [550, 450],
    ]);
    const [a, b] = parseStrokes(overlayOf());
    expect(typeof a.id).toBe("string");
    expect(typeof b.id).toBe("string");
    expect(a.id).not.toBe(b.id);

    // 상대가 그 사이 더 그은 획이 들어와도 ⌘Z는 내 마지막 획만 뺀다.
    const theirs = { id: "theirs", points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], color: "blue" as const, width: "thin" as const };
    act(() =>
      useWorkspace.setState((s) => ({
        cards: s.cards.map((x) =>
          x.id === "t1" ? { ...x, overlay: serializeStrokes([a, b, theirs]) } : x,
        ),
      })),
    );
    act(() => useWorkspace.getState().markerUndo());
    expect(parseStrokes(overlayOf()).map((x) => x.id)).toEqual([a.id, "theirs"]);
  });

  it("그리는 동안 포스트잇이 지워지면 그리던 획은 버려진다", () => {
    const c = textCard();
    useWorkspace.setState({ cards: [c], heldTool: { kind: "marker", color: "red" } });
    mockBox(0);
    const { container } = wrap(<DraggableCard card={c} />);
    const svg = layerOf(container);

    fire(svg, "pointerDown", { x: 450, y: 400 });
    fire(svg, "pointerMove", { x: 500, y: 400 });
    // 다른 사람이 이 포스트잇을 지웠다 — 컴포넌트는 아직 마운트돼 있다.
    act(() => useWorkspace.setState({ cards: [] }));
    expect(() => fire(svg, "pointerUp", { x: 550, y: 400 })).not.toThrow();

    expect(useWorkspace.getState().cards).toHaveLength(0);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(0);
  });

  it("실경로: 포인터 이벤트 → setOverlay → Dexie 노트 행에 획이 남는다", async () => {
    await useStorage.getState().init();
    const c = textCard();
    useWorkspace.setState({
      cards: [c],
      currentBoardId: SYSTEM_BOARD_ID,
      heldTool: { kind: "marker", color: "red" },
    });
    mockBox(0);
    const { container } = wrap(<Bound id="t1" />);

    stroke(layerOf(container), [
      [450, 400],
      [500, 420],
      [550, 400],
    ]);
    await flushAll();

    const row = await getDB().notes.get("t1");
    expect(row).toBeDefined();
    const saved = parseStrokes(row?.overlay ?? "");
    expect(saved).toHaveLength(1);
    expect(saved[0].color).toBe("red");
  });
});
