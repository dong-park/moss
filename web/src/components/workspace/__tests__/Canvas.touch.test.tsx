import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Canvas } from "../Canvas";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { addMemo, bootBoard, card, expectGroupClosed, note, pressUndo, readyCheck, setupNavigatorStorage, teardown, um } from "./undoTestKit";

vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({ default: () => <div />, ExpandedMarkdownEditor: () => <div /> }));
// jsdom has no PointerEvent constructor; retain pointer identity/type for React and native listeners.
function pointer(el: Element | Window, type: string, id: number, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: "touch" } });
  fireEvent(el, event);
}
function mount() {
  const view = render(<I18nProvider locale="ko"><Canvas /></I18nProvider>);
  const root = view.container.querySelector<HTMLElement>('[data-canvas-root]')!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ left: 20, top: 40, width: 390, height: 700 } as DOMRect);
  return { ...view, root };
}
beforeEach(() => {
  setupNavigatorStorage();
  useWorkspace.setState({ cards: [], connections: [], canvasHasFitted: true, currentBoardId: "touch-test", penMode: false, viewport: { x: 0, y: 0, scale: 1 } });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await teardown(); });
it("pans empty canvas, pinches around the measured centroid and rebases after lifting a finger", () => {
  const { root } = mount();
  pointer(root, "pointerdown", 1, 100, 100);
  pointer(window, "pointermove", 1, 130, 120);
  expect(useWorkspace.getState().viewport).toEqual({ x: 30, y: 20, scale: 1 });
  pointer(root, "pointerdown", 2, 230, 120);
  pointer(window, "pointermove", 2, 250, 120);
  const v = useWorkspace.getState().viewport;
  expect(v.scale).toBeCloseTo(1.1); // existing upper zoom bound
  expect((190 - 20 - v.x) / v.scale).toBeCloseTo(130);
  pointer(window, "pointerup", 2, 250, 120);
  pointer(window, "pointermove", 1, 135, 125);
  expect(useWorkspace.getState().viewport.x).toBeCloseTo(v.x + 5);
  pointer(window, "pointercancel", 1, 135, 125);
  pointer(window, "pointermove", 1, 200, 200);
  expect(useWorkspace.getState().viewport.x).toBeCloseTo(v.x + 5);
});
it("tap selects; long press drag uses the real membership and undo boundary", async () => {
  const b = await bootBoard();
  const f = useWorkspace.getState().addFrameAt(0, 0);
  useWorkspace.getState().resizeFrame(f, { width: 800, height: 600 });
  const id = addMemo(1000, 1000);
  await readyCheck(b);
  useWorkspace.setState({ canvasHasFitted: true, viewport: { x: 0, y: 0, scale: 1 } });
  const { container } = mount();
  const el = container.querySelector(`[data-card-id="${id}"]`)!;
  pointer(el, "pointerdown", 1, 1000, 1000);
  pointer(window, "pointerup", 1, 1000, 1000);
  expect(useWorkspace.getState().selectedIds).toEqual([id]);
  vi.useFakeTimers();
  pointer(el, "pointerdown", 1, 1000, 1000);
  act(() => vi.advanceTimersByTime(450));
  pointer(window, "pointermove", 1, 200, 200);
  pointer(window, "pointerup", 1, 200, 200);
  expect(note(id)).toMatchObject({ x: 200, y: 200, frameId: f });
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(card(id)).toMatchObject({ x: 1000, y: 1000 });
});
it("fit all includes board cards and dispersed cards below the automatic fit minimum", () => {
  useWorkspace.setState({ cards: [{ id: "a", kind: "board", x: -10000, y: -5000, width: 240, height: 160, content: "" }, { id: "b", kind: "text", x: 10000, y: 5000, width: 240, content: "" }] });
  useWorkspace.getState().fitAllCards({ width: 390, height: 700 });
  const v = useWorkspace.getState().viewport;
  expect(v.scale).toBeLessThan(0.25);
  for (const c of useWorkspace.getState().cards) {
    expect(c.x * v.scale + v.x).toBeGreaterThanOrEqual(24);
    expect((c.x + c.width) * v.scale + v.x).toBeLessThanOrEqual(366);
    expect(c.y * v.scale + v.y).toBeGreaterThanOrEqual(64);
    expect((c.y + (c.height ?? 160)) * v.scale + v.y).toBeLessThanOrEqual(604);
  }
});
it.each(["second finger", "pointercancel", "lostpointercapture", "unmount"])("%s closes an active drag without dropping in trash", async (reason) => {
  const b = await bootBoard();
  const id = addMemo(100, 100);
  await readyCheck(b);
  useWorkspace.setState({ canvasHasFitted: true, viewport: { x: 0, y: 0, scale: 1 } });
  const { container, unmount } = mount();
  const el = container.querySelector(`[data-card-id="${id}"]`)!;
  const trash = document.createElement("div");
  trash.dataset.dockId = "trash";
  document.body.appendChild(trash);
  document.elementsFromPoint = () => [trash];
  vi.useFakeTimers();
  pointer(el, "pointerdown", 1, 100, 100);
  act(() => vi.advanceTimersByTime(450));
  pointer(window, "pointermove", 1, 150, 150);
  expect(useWorkspace.getState().draggingId).toBe(id);
  if (reason === "second finger") pointer(el, "pointerdown", 2, 250, 150);
  else if (reason === "unmount") unmount();
  else pointer(window, reason, 1, 150, 150);
  expect(note(id)).toMatchObject({ x: 150, y: 150 });
  expect(useWorkspace.getState().draggingId).toBeNull();
  expect(useWorkspace.getState().dropTargetTrash).toBe(false);
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  if (reason === "second finger") {
    pointer(window, "pointermove", 2, 260, 150);
    expect(useWorkspace.getState().viewport.scale).toBeCloseTo(1.1);
    expect(note(id)).toMatchObject({ x: 150, y: 150 });
    pointer(window, "pointerup", 2, 260, 150);
    pointer(window, "pointerup", 1, 150, 150);
  }
  pressUndo();
  expect(note(id)).toMatchObject({ x: 100, y: 100 });
});
it("moving before the hold deadline pans without dragging, and suppresses synthetic mouse selection", () => {
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 0, y: 0, width: 240, content: "" }] });
  const { root, container } = mount();
  const el = container.querySelector('[data-card-id="a"]')!;
  vi.useFakeTimers();
  pointer(el, "pointerdown", 1, 100, 100);
  pointer(window, "pointermove", 1, 120, 110);
  act(() => vi.advanceTimersByTime(500));
  expect(useWorkspace.getState().viewport).toEqual({ x: 20, y: 10, scale: 1 });
  expect(useWorkspace.getState().draggingId).toBeNull();
  pointer(window, "pointerup", 1, 120, 110);
  fireEvent.mouseDown(el, { button: 0 });
  expect(useWorkspace.getState().selectedIds).toEqual([]);
  // Real control taps immediately after navigation must still work.
  fireEvent.click(root.querySelector('[aria-label="전체 보기"]')!);
  expect(useWorkspace.getState().viewport.scale).toBe(1);
  expect(useWorkspace.getState().viewport.x).toBeCloseTo(75);
});
it("a second finger or unmount clears a pending long press", () => {
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 0, y: 0, width: 240, content: "" }] });
  const { root, container, unmount } = mount();
  const el = container.querySelector('[data-card-id="a"]')!;
  vi.useFakeTimers();
  pointer(el, "pointerdown", 1, 100, 100);
  pointer(el, "pointerdown", 2, 200, 100);
  act(() => vi.advanceTimersByTime(500));
  expect(useWorkspace.getState().selectedIds).toEqual([]);
  pointer(window, "pointerup", 2, 200, 100);
  pointer(window, "pointerup", 1, 100, 100);
  pointer(el, "pointerdown", 3, 100, 100);
  unmount();
  act(() => vi.advanceTimersByTime(500));
  pointer(window, "pointermove", 3, 200, 200);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  expect(root.isConnected).toBe(false);
});
it("editable controls and pen mode receive touch input without canvas navigation", () => {
  const { root } = mount();
  const input = document.createElement("input");
  root.appendChild(input);
  pointer(input, "pointerdown", 1, 100, 100);
  pointer(window, "pointermove", 1, 200, 200);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  useWorkspace.setState({ penMode: true });
  pointer(root, "pointerdown", 2, 100, 100);
  pointer(window, "pointermove", 2, 200, 200);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
});
it("overview button uses measured canvas bounds, includes a board-only canvas and handles empty", () => {
  const { root } = mount();
  useWorkspace.setState({ cards: [{ id: "b", kind: "board", x: 3000, y: 4000, width: 240, height: 160, content: "" }] });
  fireEvent.click(root.querySelector('[aria-label="전체 보기"]')!);
  const v = useWorkspace.getState().viewport;
  expect(v.scale).toBe(1);
  expect(3000 + v.x).toBeCloseTo(75);
  // Two mobile control rows reserve 148px rather than the old 96px.
  expect(4000 + v.y).toBeCloseTo(228);
  useWorkspace.setState({ cards: [] });
  fireEvent.click(root.querySelector('[aria-label="전체 보기"]')!);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
});
it("pinch can return to a fitted scale below MIN_SCALE without jumping to 25%", () => {
  const { root } = mount();
  useWorkspace.setState({ viewport: { x: 10, y: 20, scale: 0.02 } });
  pointer(root, "pointerdown", 1, 100, 100);
  pointer(root, "pointerdown", 2, 200, 100);
  pointer(window, "pointermove", 2, 250, 100);
  expect(useWorkspace.getState().viewport.scale).toBeCloseTo(0.03);
  pointer(window, "pointermove", 2, 200, 100);
  const restored = useWorkspace.getState().viewport;
  expect(restored.x).toBeCloseTo(10, 12);
  expect(restored.y).toBeCloseTo(20, 12);
  expect(restored.scale).toBeCloseTo(0.02, 12);
  pointer(window, "pointerup", 2, 200, 100);
  pointer(window, "pointerup", 1, 100, 100);
});
it("fit all uses the square memo bounds when height is absent", () => {
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 0, y: 0, width: 800, content: "" }] });
  useWorkspace.getState().fitAllCards({ width: 1200, height: 700 });
  const v = useWorkspace.getState().viewport;
  expect(v.scale).toBeCloseTo(540 / 800);
  expect(800 * v.scale + v.y).toBeCloseTo(604);
});


it("offers touch editing for an existing todo without relying on synthetic double-click", () => {
  vi.stubGlobal("innerWidth", 390);
  useWorkspace.setState({ cards: [{ id: "todo", kind: "text", x: 20, y: 20, width: 240, content: "- [ ] first item" }], editingId: null, expandedCardId: null, selectedIds: [] });
  const { container } = mount();
  const el = container.querySelector('[data-card-id="todo"]')!;
  pointer(el, "pointerdown", 1, 50, 50);
  pointer(window, "pointerup", 1, 50, 50);
  const toolbar = container.querySelector('[role="toolbar"][aria-label="선택한 카드 조작"]')!;
  expect(toolbar).toBeTruthy();
  fireEvent.click(toolbar.querySelector("button")!);
  expect(useWorkspace.getState()).toMatchObject({ expandedCardId: "todo", expandedCardMode: "edit", editingId: null });
});

it("the visible move handle drags only the selected note immediately and keeps undo", async () => {
  vi.stubGlobal("innerWidth", 390);
  const b = await bootBoard();
  const id = addMemo(100, 100);
  await readyCheck(b);
  useWorkspace.setState({ selectedIds: [id], editingId: null, expandedCardId: null, canvasHasFitted: true, viewport: { x: 0, y: 0, scale: 0.5 } });
  const { container } = mount();
  const handle = container.querySelector('[aria-label="끌어서 이동"]')!;
  expect(handle).toBeTruthy();
  pointer(handle, "pointerdown", 1, 100, 100);
  pointer(handle, "pointermove", 1, 125, 110);
  pointer(handle, "pointerup", 1, 125, 110);
  expect(note(id)).toMatchObject({ x: 150, y: 120 });
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 0.5 });
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(note(id)).toMatchObject({ x: 100, y: 100 });
});
