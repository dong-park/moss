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
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";

/**
 * wall-marker 리뷰 W4 — 벽 획 렌더 비용. 그리는 중·옮기는 중·팬 중에 정적 획을 다시 만들지
 * 않고, 화면 밖 획은 그리지 않고, 옮기는 중에는 고른 획을 <g transform> 하나로 움직인다.
 *
 * 획 하나가 (다시) 그려질 때마다 markerColorValue를 한 번 부른다 — 그 호출 수로 "몇 번
 * 그렸나"를 센다. 새 획은 빨강, 그리는 중 미리보기는 파랑이라 서로 섞이지 않는다.
 */

const calls = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("@/state/marker/tokens", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/state/marker/tokens")>();
  return {
    ...orig,
    markerColorValue: (c: unknown) => {
      calls.names.push(String(c));
      return orig.markerColorValue(c);
    },
  };
});
const redDraws = () => calls.names.filter((n) => n === "red").length;

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

function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
}

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
  calls.names.length = 0;
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
  useWorkspace.setState({ ...RESET, boards: [], currentBoardId: SYSTEM_BOARD_ID, viewportByBoard: {} });
  setWindowSize(originalSize.w, originalSize.h);
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

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

function pointer(
  target: Element,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  init: { clientX: number; clientY: number; pointerId?: number },
) {
  const ev = createEvent[type](target, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(ev, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(ev, "pointerType", { value: "mouse" });
  fireEvent(target, ev);
}

const seg = (x: number, y: number) => [
  { x, y },
  { x: x + 40, y: y + 10 },
];

function addRed(x: number, y: number) {
  return useWorkspace.getState().addWallStroke({ points: seg(x, y), color: "red", width: "thin" })!;
}

describe("정적 획은 그리는 중·옮기는 중·팬 중에 다시 그려지지 않는다", () => {
  it("파랑 마카로 긋는 동안 이미 있는 획은 다시 그려지지 않는다", async () => {
    for (let i = 0; i < 20; i++) addRed(100 + i * 10, 300);
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("blue"));
    const before = redDraws();
    expect(before).toBeGreaterThan(0);

    pointer(root, "pointerDown", { clientX: 50, clientY: 50 });
    for (let k = 1; k <= 6; k++) pointer(root, "pointerMove", { clientX: 50 + k * 8, clientY: 50 + k * 3 });
    pointer(root, "pointerUp", { clientX: 100, clientY: 70 });

    expect(redDraws()).toBe(before);
  });

  it("팬(뷰포트 이동) 중 같은 구역 안에서는 이미 그려진 획을 다시 만들지 않는다", async () => {
    for (let i = 0; i < 20; i++) addRed(100 + i * 10, 300);
    await mountCanvas();
    const before = redDraws();
    for (let k = 1; k <= 5; k++) {
      act(() => useWorkspace.setState({ viewport: { x: -k * 7, y: -k * 3, scale: 1 } }));
    }
    expect(redDraws()).toBe(before);
  });

  it("묶음을 끌어 옮기는 동안 고른 획도 다시 그려지지 않는다 — 그룹 transform만 바뀐다", async () => {
    const a = addRed(200, 100);
    const b = addRed(200, 140);
    addRed(700, 500);
    act(() => useWorkspace.getState().selectWallStrokes([a.id, b.id]));
    const { root } = await mountCanvas();
    const before = redDraws();
    const rect = root.querySelector<SVGRectElement>('[data-wall-selection="true"]')!;
    expect(rect).toBeTruthy();

    pointer(rect, "pointerDown", { clientX: 220, clientY: 120 });
    for (let k = 1; k <= 5; k++) pointer(rect, "pointerMove", { clientX: 220 + k * 12, clientY: 120 + k * 8 });

    const group = root.querySelector('[data-wall-move-group]')!;
    expect(group.getAttribute("transform")).toBe("translate(60 40)");
    expect(group.querySelector(`[data-wall-stroke="${a.id}"]`)).toBeTruthy();
    expect(group.querySelector(`[data-wall-stroke="${b.id}"]`)).toBeTruthy();
    // 폴리라인 자체는 transform을 받지 않는다.
    expect(root.querySelector("polyline[data-wall-stroke][transform]")).toBeNull();
    expect(redDraws()).toBe(before);

    pointer(rect, "pointerUp", { clientX: 280, clientY: 160 });
  });
});

describe("화면 밖 획은 그리지 않는다", () => {
  it("멀리 있는 획은 DOM에 없고, 그쪽으로 팬하면 나타난다", async () => {
    const near = addRed(100, 100);
    const far = addRed(6000, 100);
    const { root } = await mountCanvas();
    expect(root.querySelector(`[data-wall-stroke="${near.id}"]`)).toBeTruthy();
    expect(root.querySelector(`[data-wall-stroke="${far.id}"]`)).toBeNull();

    act(() => useWorkspace.setState({ viewport: { x: -5800, y: 0, scale: 1 } }));
    expect(root.querySelector(`[data-wall-stroke="${far.id}"]`)).toBeTruthy();
    // 이번엔 처음 획이 멀어졌다.
    expect(root.querySelector(`[data-wall-stroke="${near.id}"]`)).toBeNull();
  });

  it("고른 획은 화면 밖이어도 사라지지 않는다(묶음 테두리가 끊기지 않게)", async () => {
    const far = addRed(6000, 100);
    act(() => useWorkspace.getState().selectWallStrokes([far.id]));
    const { root } = await mountCanvas();
    expect(root.querySelector(`[data-wall-stroke="${far.id}"]`)).toBeTruthy();
  });
});

describe("쌓임 순서", () => {
  it("고른 획을 그룹으로 묶어도 그린 순서가 그대로다(가운데 획만 골라도 위·아래가 안 바뀐다)", async () => {
    const a = addRed(100, 100);
    const b = addRed(110, 100);
    const c = addRed(120, 100);
    act(() => useWorkspace.getState().selectWallStrokes([b.id]));
    const { root } = await mountCanvas();
    const ids = [...root.querySelectorAll<SVGElement>("[data-wall-stroke]")].map((el) =>
      el.getAttribute("data-wall-stroke"),
    );
    expect(ids).toEqual([a.id, b.id, c.id]);
    expect(
      root.querySelector(`[data-wall-stroke="${b.id}"]`)!.closest("[data-wall-move-group]"),
    ).toBeTruthy();
    expect(
      root.querySelector(`[data-wall-stroke="${a.id}"]`)!.closest("[data-wall-move-group]"),
    ).toBeNull();
  });
});

describe("지우개 조각의 쌓임 순서 (W10)", () => {
  it("천으로 맨 아래 획의 가운데를 닦아도 남은 조각이 위 획들 위로 튀지 않는다", async () => {
    const ws = useWorkspace.getState();
    const a = ws.addWallStroke({
      points: [{ x: 100, y: 100 }, { x: 300, y: 100 }],
      color: "red",
      width: "thin",
    })!;
    const b = ws.addWallStroke({
      points: [{ x: 100, y: 140 }, { x: 300, y: 140 }],
      color: "blue",
      width: "thin",
    })!;
    const c = ws.addWallStroke({
      points: [{ x: 100, y: 180 }, { x: 300, y: 180 }],
      color: "green",
      width: "thin",
    })!;
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdCloth());

    pointer(root, "pointerDown", { clientX: 200, clientY: 100 });
    pointer(root, "pointerMove", { clientX: 206, clientY: 100 });
    pointer(root, "pointerUp", { clientX: 206, clientY: 100 });

    const order = [...root.querySelectorAll<SVGElement>("[data-wall-stroke]")].map((el) =>
      el.getAttribute("data-wall-stroke"),
    );
    // 원본 a는 사라지고 조각 둘이 b·c 아래에 있다.
    expect(order).not.toContain(a.id);
    expect(order).toHaveLength(4);
    expect(order.slice(-2)).toEqual([b.id, c.id]);
    const pieces = useWorkspace.getState().wallStrokes.slice(0, 2);
    expect(pieces.every((p) => p.createdAt === a.createdAt)).toBe(true);
  });
});
