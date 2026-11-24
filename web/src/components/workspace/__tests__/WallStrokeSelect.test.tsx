import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { useToasts } from "@/state/notifications";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { resetCollabStore } from "@/state/collab";
import { destroyBoardDocs, getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import { readStrokes } from "@/state/ydoc/model";

// wall-marker n6 — 벽 획 고르기·옮기기. 실제 Canvas의 고르기 상자(마우스)와 묶음 상자(포인터)를 타고
// 스토어 → Y.Doc → Dexie까지 간다.

let originalStorage: PropertyDescriptor | undefined;
const originalSize = { w: 0, h: 0 };

const RESET = {
  cards: [],
  wallStrokes: [],
  selectedIds: [],
  selectedWallStrokeIds: [],
  editingId: null,
  heldTool: null,
  markerWidth: "thin" as const,
  lastMarkerColor: "black" as const,
  markerUndoStack: [],
  markerRedoStack: [],
  textPlacementArmed: false,
  viewport: { x: 0, y: 0, scale: 1 },
};

beforeEach(async () => {
  originalSize.w = window.innerWidth;
  originalSize.h = window.innerHeight;
  setWindowSize(1024, 768);
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
  resetCollabStore();
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  useWorkspace.setState(RESET);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await destroyBoardDocs();
  await resetDB();
  resetCollabStore();
  useToasts.getState().clear();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    ...RESET,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewportByBoard: {},
  });
  setWindowSize(originalSize.w, originalSize.h);
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
}

async function mountCanvas() {
  const utils = render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  const root = utils.container.querySelector<HTMLElement>('[data-canvas-root="true"]')!;
  expect(root).toBeTruthy();
  return { ...utils, root };
}

type PointerKind = "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel";

function pointer(
  target: Element,
  type: PointerKind,
  init: { pointerId?: number; clientX: number; clientY: number; pointerType?: string },
) {
  const ev = createEvent[type](target, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(ev, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(ev, "pointerType", { value: init.pointerType ?? "mouse" });
  fireEvent(target, ev);
}

/** 마카를 내려놓은 채 빈 벽을 끌어 고르기 상자를 만든다 — 실제 Canvas의 마우스 경로. */
function marquee(root: Element, from: [number, number], to: [number, number], mods = {}) {
  fireEvent.mouseDown(root, { button: 0, clientX: from[0], clientY: from[1], ...mods });
  fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1] });
  fireEvent.mouseUp(window, { clientX: to[0], clientY: to[1] });
}

/** 옮기는 중 미리보기 이동 — 고른 획을 감싼 <g>의 transform이다(획마다 다시 그리지 않는다). */
const moveTransformOf = (world: Element, id: string) =>
  world.querySelector(`[data-wall-stroke="${id}"]`)!.closest("[data-wall-move-group]")?.getAttribute(
    "transform",
  ) ?? null;

const strokes = () => useWorkspace.getState().wallStrokes;
const picked = () => useWorkspace.getState().selectedWallStrokeIds;
const selectionRect = (root: Element) =>
  root.querySelector<SVGRectElement>('[data-wall-selection="true"]');

/** 제목 두 획 + 밑줄 하나 + 멀리 있는 획 하나를 벽에 둔다. */
function seed() {
  const ws = useWorkspace.getState();
  const title = ws.addWallStroke({
    points: [{ x: 200, y: 100 }, { x: 260, y: 90 }, { x: 320, y: 100 }],
    color: "blue",
    width: "mid",
  })!;
  const under = ws.addWallStroke({
    points: [{ x: 190, y: 140 }, { x: 330, y: 140 }],
    color: "blue",
    width: "mid",
  })!;
  const far = ws.addWallStroke({
    points: [{ x: 700, y: 500 }, { x: 760, y: 540 }],
    color: "red",
    width: "thin",
  })!;
  return { title, under, far };
}

describe("빈 벽을 끌어 상자로 벽 획을 고른다 (T17)", () => {
  it("상자에 닿은 제목·밑줄만 하나의 테두리로 묶이고, 안 닿은 획은 안 묶인다", async () => {
    const { root } = await mountCanvas();
    const { title, under, far } = seed();

    marquee(root, [150, 60], [360, 170]);

    expect(picked().sort()).toEqual([title.id, under.id].sort());
    expect(picked()).not.toContain(far.id);
    const rect = selectionRect(root)!;
    expect(rect).toBeTruthy();
    expect(rect.getAttribute("data-count")).toBe("2");
    // 닿지 않은 획은 묶음 표시가 없다.
    const world = root.querySelector("[data-canvas-world]")!;
    expect(world.querySelector(`[data-wall-stroke="${far.id}"]`)!.getAttribute("data-selected")).toBeNull();
    expect(world.querySelector(`[data-wall-stroke="${title.id}"]`)!.getAttribute("data-selected")).toBe("true");
    // 테두리는 두 획을 모두 감싼다.
    const x = Number(rect.getAttribute("x"));
    const y = Number(rect.getAttribute("y"));
    const w = Number(rect.getAttribute("width"));
    const h = Number(rect.getAttribute("height"));
    expect(x).toBeLessThanOrEqual(190);
    expect(y).toBeLessThanOrEqual(90);
    expect(x + w).toBeGreaterThanOrEqual(330);
    expect(y + h).toBeGreaterThanOrEqual(140);
  });

  it("끄는 동안 반투명 고르기 상자가 보이고, 점이 안 들어도 선분이 가로지르면 잡힌다", async () => {
    const { root } = await mountCanvas();
    const { under } = seed();

    fireEvent.mouseDown(root, { button: 0, clientX: 250, clientY: 120 });
    fireEvent.mouseMove(window, { clientX: 270, clientY: 160 });
    // 화면 좌표 상자가 DOM에 보인다.
    expect(root.innerHTML).toContain("rgba(79, 124, 243, 0.08)");
    fireEvent.mouseUp(window, { clientX: 270, clientY: 160 });

    // 밑줄의 두 끝점(190·330)은 상자 밖이지만 선분이 상자를 지난다.
    expect(picked()).toEqual([under.id]);
  });

  it("빈 벽을 한 번 누르면 묶음이 풀린다", async () => {
    const { root } = await mountCanvas();
    seed();
    marquee(root, [150, 60], [360, 170]);
    expect(picked()).toHaveLength(2);

    fireEvent.mouseDown(root, { button: 0, clientX: 600, clientY: 300 });
    fireEvent.mouseUp(window, { clientX: 600, clientY: 300 });

    expect(picked()).toEqual([]);
    expect(selectionRect(root)).toBeNull();
  });

  it("아무것도 안 닿는 상자는 묶음을 비운다", async () => {
    const { root } = await mountCanvas();
    seed();
    marquee(root, [150, 60], [360, 170]);
    marquee(root, [400, 300], [500, 400]);
    expect(picked()).toEqual([]);
  });

  it("마카를 집으면 묶음이 풀리고, 든 채로는 고를 수 없다", async () => {
    const { root } = await mountCanvas();
    seed();
    marquee(root, [150, 60], [360, 170]);
    expect(picked()).toHaveLength(2);

    act(() => useWorkspace.getState().holdMarker("red"));
    expect(picked()).toEqual([]);
    expect(selectionRect(root)).toBeNull();

    // 든 채 고르기 호출은 비운 채로 남는다 (불가능한 조합).
    act(() => useWorkspace.getState().selectWallStrokes([strokes()[0].id]));
    expect(picked()).toEqual([]);
  });

  it("천을 집어도 묶음이 풀린다", async () => {
    const { root } = await mountCanvas();
    seed();
    marquee(root, [150, 60], [360, 170]);
    act(() => useWorkspace.getState().holdCloth());
    expect(picked()).toEqual([]);
    expect(selectionRect(root)).toBeNull();
  });

  it("마카를 든 동안 빈 벽 끌기는 고르기가 아니라 획이다 (n4 가르기 그대로)", async () => {
    const { root } = await mountCanvas();
    seed();
    act(() => useWorkspace.getState().holdMarker("green"));
    const before = strokes().length;
    pointer(root, "pointerDown", { clientX: 400, clientY: 300 });
    pointer(root, "pointerMove", { clientX: 450, clientY: 320 });
    pointer(root, "pointerUp", { clientX: 450, clientY: 320 });
    expect(strokes()).toHaveLength(before + 1);
    expect(picked()).toEqual([]);
  });

  it("shift로 더하면 이전 묶음에 합쳐진다", async () => {
    const { root } = await mountCanvas();
    const { title, far } = seed();
    marquee(root, [150, 60], [360, 110]);
    expect(picked()).toEqual([title.id]);
    marquee(root, [650, 450], [800, 600], { shiftKey: true });
    expect(picked().sort()).toEqual([title.id, far.id].sort());
  });
});

describe("고른 벽 획을 끌어 옮긴다 (T18)", () => {
  it("끄는 동안 미리보기로 따라오고, 놓으면 모든 점이 같은 dx·dy만큼 옮겨져 한 번 저장된다", async () => {
    const { root } = await mountCanvas();
    const { title, under, far } = seed();
    const orig = {
      title: title.points.map((p) => ({ ...p })),
      under: under.points.map((p) => ({ ...p })),
      far: far.points.map((p) => ({ ...p })),
    };
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    const x0 = Number(rect.getAttribute("x"));

    const moveSpy = vi.spyOn(useWorkspace.getState(), "moveWallStrokes");
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 290, clientY: 140 });
    pointer(rect, "pointerMove", { clientX: 320, clientY: 160 });

    // 미리보기: 화면에서는 움직였지만 저장값은 그대로다.
    const world = root.querySelector("[data-canvas-world]")!;
    expect(moveTransformOf(world, title.id)).toBe("translate(60 40)");
    expect(
      moveTransformOf(world, far.id),
    ).toBeNull();
    expect(Number(selectionRect(root)!.getAttribute("x"))).toBe(x0 + 60);
    expect(strokes().find((s) => s.id === title.id)!.points).toEqual(orig.title);
    expect(moveSpy).not.toHaveBeenCalled();

    pointer(rect, "pointerUp", { clientX: 320, clientY: 160 });

    // 놓은 순간 한 번.
    expect(moveSpy).toHaveBeenCalledTimes(1);
    const after = (id: string) => strokes().find((s) => s.id === id)!.points;
    expect(after(title.id)).toEqual(orig.title.map((p) => ({ x: p.x + 60, y: p.y + 40 })));
    expect(after(under.id)).toEqual(orig.under.map((p) => ({ x: p.x + 60, y: p.y + 40 })));
    expect(after(far.id)).toEqual(orig.far);
    // 모양과 간격을 지킨다 — 제목과 밑줄 사이 거리 불변.
    expect(after(under.id)[0].x - after(title.id)[0].x).toBe(under.points[0].x - title.points[0].x);
    // 미리보기가 걷히고 묶음은 놓은 자리에서 그대로 골라져 있다.
    expect(
      moveTransformOf(world, title.id),
    ).toBeNull();
    expect(picked()).toHaveLength(2);
  });

  it("실경로: 놓은 자리가 Y.Doc에 남고 새로고침해도 옮긴 자리에 있다", async () => {
    const { root } = await mountCanvas();
    const { title } = seed();
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 340, clientY: 180 });
    pointer(rect, "pointerUp", { clientX: 340, clientY: 180 });

    const expected = title.points.map((p) => ({ x: p.x + 80, y: p.y + 60 }));
    // 원본 문서(공유 보드면 다른 사람 화면이 읽는 곳).
    const inDoc = readStrokes(getActiveBoardDoc()!.doc).find((s) => s.id === title.id)!;
    expect(inDoc.points).toEqual(expected);
    // 새로고침.
    useWorkspace.setState({ wallStrokes: [] });
    await act(async () => {
      await useWorkspace.getState().loadFromStorage();
    });
    expect(strokes().find((s) => s.id === title.id)!.points).toEqual(expected);
  });

  it("줌 2배에서는 화면 이동량의 절반이 보드 단위 이동이다", async () => {
    const { root } = await mountCanvas();
    const { under } = seed();
    act(() => useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 2 } }));
    // 보드 (190..330, 140)은 화면 (380..660, 280). 상자는 화면 좌표다.
    marquee(root, [300, 200], [700, 340]);
    expect(picked()).toContain(under.id);
    const rect = selectionRect(root)!;
    pointer(rect, "pointerDown", { clientX: 500, clientY: 280 });
    pointer(rect, "pointerMove", { clientX: 560, clientY: 320 });
    pointer(rect, "pointerUp", { clientX: 560, clientY: 320 });

    expect(strokes().find((s) => s.id === under.id)!.points[0]).toEqual({ x: 220, y: 160 });
  });

  it("손 떨림 정도(문턱 미만)의 누르기는 저장하지 않는다", async () => {
    const { root } = await mountCanvas();
    const { title } = seed();
    const stamp = title.updatedAt;
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 261, clientY: 121 });
    pointer(rect, "pointerUp", { clientX: 261, clientY: 121 });

    const now = strokes().find((s) => s.id === title.id)!;
    expect(now.points).toEqual(title.points);
    expect(now.updatedAt).toBe(stamp);
    expect(picked()).toHaveLength(2);
  });

  it("옮기는 사이 다른 쪽이 지운 획은 되살리지 않는다 (지운 쪽이 이긴다)", async () => {
    const { root } = await mountCanvas();
    const { title, under } = seed();
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 300, clientY: 150 });

    act(() => useWorkspace.getState().removeWallStrokes([under.id]));
    pointer(selectionRect(root)!, "pointerUp", { clientX: 300, clientY: 150 });

    expect(strokes().map((s) => s.id)).not.toContain(under.id);
    expect(readStrokes(getActiveBoardDoc()!.doc).map((s) => s.id)).not.toContain(under.id);
    expect(strokes().find((s) => s.id === title.id)!.points[0]).toEqual({
      x: title.points[0].x + 40,
      y: title.points[0].y + 30,
    });
  });

  it("펜은 묶음 안에서도 옮기지 않고 쓴다 (D5)", async () => {
    const { root } = await mountCanvas();
    seed();
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    const before = strokes().length;
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120, pointerType: "pen" });
    pointer(rect, "pointerMove", { clientX: 290, clientY: 130, pointerType: "pen" });
    pointer(rect, "pointerUp", { clientX: 290, clientY: 130, pointerType: "pen" });
    expect(strokes()).toHaveLength(before + 1);
  });

  it("휴대폰 크기에서는 옮기지 않는다", async () => {
    const { root } = await mountCanvas();
    const { title } = seed();
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    setWindowSize(390, 800);
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 340, clientY: 180 });
    pointer(rect, "pointerUp", { clientX: 340, clientY: 180 });
    expect(strokes().find((s) => s.id === title.id)!.points).toEqual(title.points);
  });
});

describe("옮기는 도중 Esc면 제자리로 돌아간다 (T19)", () => {
  it("미리보기가 걷히고 저장값은 그대로이며 묶음은 골라진 채 남는다", async () => {
    const { root } = await mountCanvas();
    const { title, under } = seed();
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 340, clientY: 180 });
    const world = root.querySelector("[data-canvas-world]")!;
    expect(
      moveTransformOf(world, title.id),
    ).toBe("translate(80 60)");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      moveTransformOf(world, title.id),
    ).toBeNull();
    expect(selectionRect(root)!.getAttribute("data-moving")).toBeNull();
    expect(picked().sort()).toEqual([title.id, under.id].sort());
    expect(strokes().find((s) => s.id === title.id)!.points).toEqual(title.points);

    // 이어서 손을 놓아도 저장되지 않는다.
    pointer(selectionRect(root)!, "pointerUp", { clientX: 340, clientY: 180 });
    expect(strokes().find((s) => s.id === title.id)!.points).toEqual(title.points);
    // 문서(원본)에도 그대로다.
    expect(readStrokes(getActiveBoardDoc()!.doc).find((s) => s.id === title.id)!.points).toEqual(
      title.points,
    );
  });

  it("옮기는 중이 아닐 때의 Esc는 묶음을 푼다", async () => {
    const { root } = await mountCanvas();
    seed();
    marquee(root, [150, 60], [360, 170]);
    expect(picked()).toHaveLength(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(picked()).toEqual([]);
    expect(selectionRect(root)).toBeNull();
  });

  it("옮기는 중 마카를 집으면 옮기기는 없던 일이 된다", async () => {
    const { root } = await mountCanvas();
    const { title } = seed();
    marquee(root, [150, 60], [360, 170]);
    const rect = selectionRect(root)!;
    pointer(rect, "pointerDown", { clientX: 260, clientY: 120 });
    pointer(rect, "pointerMove", { clientX: 340, clientY: 180 });
    act(() => useWorkspace.getState().holdMarker("blue"));
    pointer(root, "pointerUp", { clientX: 340, clientY: 180 });
    expect(strokes().find((s) => s.id === title.id)!.points).toEqual(title.points);
    expect(root.querySelector('[data-wall-move-group][transform]')).toBeNull();
  });
});
