import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Canvas } from "../Canvas";
import { useMobileCanvas } from "../mobileCanvas";
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
  useMobileCanvas.getState().close();
  useWorkspace.setState({ cards: [], connections: [], canvasHasFitted: true, currentBoardId: "touch-test", penMode: false, viewport: { x: 0, y: 0, scale: 1 } });
});
afterEach(async () => { vi.restoreAllMocks(); await teardown(); });
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

it.each([0.25, 0.5, 1])("native touch on SE resize owns the gesture at scale %s, without moving card or world", async (scale) => {
  const b = await bootBoard();
  const id = addMemo(100, 100);
  await readyCheck(b);
  useWorkspace.setState({ selectedIds: [id], editingId: null, canvasHasFitted: true, viewport: { x: 0, y: 0, scale } });
  useMobileCanvas.getState().resize(id);
  const { container } = mount();
  const el = container.querySelector(`[data-card-id="${id}"] [data-resize-handle="se"]`)!;
  expect(el).not.toBeNull();
  const w = card(id).width;
  pointer(el, "pointerdown", 1, 200, 200);
  pointer(window, "pointermove", 1, 248, 224);
  pointer(window, "pointerup", 1, 248, 224);
  expect(card(id)).toMatchObject({ width: w + 48 / scale, height: w + 48 / scale, x: 100, y: 100 });
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale });
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(note(id)).toMatchObject({ width: w, x: 100, y: 100 });
});

it.each(["second finger", "pointercancel", "lostpointercapture", "unmount"])("%s ends resize ownership and never converts the remaining gesture to pan", async (reason) => {
  const b = await bootBoard();
  const id = addMemo(100, 100);
  await readyCheck(b);
  useWorkspace.setState({ selectedIds: [id], editingId: null, canvasHasFitted: true, viewport: { x: 0, y: 0, scale: 0.5 } });
  useMobileCanvas.getState().resize(id);
  const { container, root, unmount } = mount();
  const el = container.querySelector(`[data-card-id="${id}"] [data-resize-handle="se"]`)!;
  const captured = new Set<number>();
  el.setPointerCapture = vi.fn((id) => { captured.add(id); });
  el.hasPointerCapture = (id) => captured.has(id);
  el.releasePointerCapture = vi.fn((id) => { captured.delete(id); });
  root.setPointerCapture = vi.fn();
  pointer(el, "pointerdown", 11, 200, 200);
  expect(el.setPointerCapture).toHaveBeenCalledWith(11);
  expect(root.setPointerCapture).not.toHaveBeenCalled();
  pointer(window, "pointermove", 11, 220, 210);
  const resized = card(id).width;
  expect(resized).toBe(280);
  if (reason === "second finger") pointer(root, "pointerdown", 12, 300, 200);
  else if (reason === "unmount") unmount();
  else pointer(window, reason, 11, 220, 210);
  expect(el.releasePointerCapture).toHaveBeenCalledWith(11);
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  // Capture loss from cancellation must not count as a physical lift of finger 11.
  pointer(el, "lostpointercapture", 11, 220, 210);
  pointer(window, "pointermove", 11, 260, 230);
  if (reason === "second finger") {
    pointer(window, "pointermove", 12, 340, 230);
    pointer(window, "pointerup", 12, 340, 230);
    pointer(window, "pointermove", 11, 280, 240);
  }
  expect(card(id).width).toBe(resized);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 0.5 });
  pointer(window, "pointerup", 11, 280, 240);
  if (reason !== "unmount") {
    pointer(root, "pointerdown", 13, 100, 100);
    pointer(window, "pointermove", 13, 110, 105);
    pointer(window, "pointerup", 13, 110, 105);
    expect(useWorkspace.getState().viewport).toEqual({ x: 10, y: 5, scale: 0.5 });
  }
  pressUndo();
  expect(note(id)?.width).toBe(240);
});

it("a resize handle used as the second finger cannot start resize or leave a pan active", () => {
  useWorkspace.setState({ cards: [{ id: "a", kind: "text", x: 100, y: 100, width: 240, content: "" }], selectedIds: ["a"], editingId: null });
  useMobileCanvas.getState().resize("a");
  const { container, root } = mount();
  const el = container.querySelector('[data-resize-handle="se"]')!;
  pointer(root, "pointerdown", 1, 100, 100);
  pointer(el, "pointerdown", 2, 200, 200);
  pointer(window, "pointermove", 1, 130, 120);
  pointer(window, "pointermove", 2, 240, 240);
  expect(card("a").width).toBe(240);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  pointer(window, "pointerup", 2, 240, 240);
  pointer(window, "pointermove", 1, 160, 150);
  expect(useWorkspace.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  pointer(window, "pointerup", 1, 160, 150);
});
it.each(["mouse", "pen"])("Space + %s drag on a resize grip pans without resizing or starting an undo action", async(pointerType)=>{
 const b=await bootBoard();const id=addMemo(100,100);await readyCheck(b);
 useWorkspace.setState({selectedIds:[id],editingId:null,canvasHasFitted:true,viewport:{x:0,y:0,scale:1}});
 useMobileCanvas.getState().resize(id);
 const {container}=mount();
 fireEvent.keyDown(window,{code:"Space",key:" "});
 const el=container.querySelector('[data-resize-handle="se"]')!;
 const e=new MouseEvent("pointerdown",{bubbles:true,cancelable:true,button:0,clientX:200,clientY:200});
 Object.defineProperties(e,{pointerId:{value:44},pointerType:{value:pointerType}});expect(fireEvent(el,e)).toBe(true);
 fireEvent.mouseDown(el,{button:0,clientX:200,clientY:200});
 const move=new MouseEvent("pointermove",{bubbles:true,clientX:248,clientY:224});Object.defineProperty(move,"pointerId",{value:44});fireEvent(window,move);
 fireEvent.mouseMove(window,{clientX:248,clientY:224});fireEvent.mouseUp(window);fireEvent.keyUp(window,{code:"Space",key:" "});
 expect(card(id).width).toBe(240);expect(useWorkspace.getState().viewport).toEqual({x:48,y:24,scale:1});
 expectGroupClosed();expect(um().undoStack).toHaveLength(0);
});
