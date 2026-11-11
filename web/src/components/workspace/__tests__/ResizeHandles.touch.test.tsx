import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { serializeBlock } from "@/state/blocks";
import { ResizeHandles } from "../ResizeHandles";
import { useWorkspace, type Card } from "@/state/workspace";
import { activeResizePointerId } from "../resizeSession";
import { addMemo, bootBoard, card, expectGroupClosed, note, pressUndo, readyCheck, setupNavigatorStorage, teardown, um } from "./undoTestKit";

beforeEach(() => { setupNavigatorStorage(); useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 1 } }); });
afterEach(async () => { vi.restoreAllMocks(); await teardown(); });
function pointer(el: Element | Window, type: string, x: number, y: number, pointerType = "touch") {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 7 }, pointerType: { value: pointerType } });
  fireEvent(el, e);
}

it.each([0.25, 0.5, 1])("mobile opt-in has one 48 screen-pixel hit target at zoom %s; default preserves 8 paper handles", (scale) => {
  useWorkspace.setState({ viewport: { x: 0, y: 0, scale } });
  const c: Card = { id: "a", kind: "text", content: "", x: 0, y: 0, width: 240 };
  const { container, rerender } = render(<ResizeHandles card={c} measuredHeight={240} />);
  expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(8);
  rerender(<ResizeHandles card={c} measuredHeight={240} mobile />);
  const handles = container.querySelectorAll<HTMLElement>("[data-resize-handle]");
  expect(handles).toHaveLength(1);
  expect(handles[0].dataset.resizeHandle).toBe("se");
  expect(parseFloat(handles[0].style.width) * scale).toBe(48);
  expect(parseFloat(handles[0].style.height) * scale).toBe(48);
  expect(handles[0].style.touchAction).toBe("none");
});
it.each([
  { kind: "text", content: "- [ ] one" },
  { kind: "text", content: serializeBlock({ type: "link", url: "https://example.com", title: "title" })! },
  { kind: "textbox", content: "words" },
] as const)("$kind $content uses a single right width handle in mobile mode", (overrides) => {
  const c: Card = { id: "a", x: 0, y: 0, width: 240, ...overrides };
  const { container } = render(<ResizeHandles card={c} measuredHeight={80} mobile />);
  expect([...container.querySelectorAll<HTMLElement>("[data-resize-handle]")].map((h) => h.dataset.resizeHandle)).toEqual(["e"]);
});
it.each(["touch", "mouse"])("%s pointer events resize once; compatibility mousedown cannot restart the action", async (pointerType) => {
  const b = await bootBoard();
  const id = addMemo(100, 100);
  await readyCheck(b);
  const { container } = render(<ResizeHandles card={card(id)} measuredHeight={240} />);
  const el = container.querySelector('[data-resize-handle="se"]')!;
  pointer(el, "pointerdown", 0, 0, pointerType);
  expect(activeResizePointerId()).toBe(7);
  fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
  pointer(window, "pointermove", 48, 24, pointerType);
  fireEvent.mouseMove(window, { clientX: 300, clientY: 300 });
  expect(card(id).width).toBe(288);
  pointer(window, "pointerup", 48, 24, pointerType);
  expect(activeResizePointerId()).toBeNull();
  fireEvent.mouseDown(el, { button: 0, clientX: 48, clientY: 24 });
  fireEvent.mouseMove(window, { clientX: 400, clientY: 400 });
  fireEvent.mouseUp(window);
  expect(note(id)?.width).toBe(288);
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(note(id)?.width).toBe(240);
});
it("left textbox handle anchors the right edge in the document, including undo", async () => {
  const b = await bootBoard();
  const id = addMemo(400, 100, "textbox");
  await readyCheck(b);
  const start = card(id);
  const { container } = render(<ResizeHandles card={start} measuredHeight={40} />);
  const el = container.querySelector('[data-resize-handle="w"]')!;
  fireEvent.mouseDown(el, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseMove(window, { clientX: -120, clientY: 0 });
  fireEvent.mouseUp(window);
  expect(note(id)).toMatchObject({ width: start.width + 120, x: 280, y: 100, autoWidth: false });
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(note(id)).toMatchObject({ width: start.width, x: 400, y: 100, autoWidth: true });
});

it("NW frame drag keeps the opposite corner and legacy baseWidth, without scaling children", async () => {
  const b = await bootBoard();
  const f = useWorkspace.getState().addFrameAt(100, 100);
  const child = addMemo(200, 200);
  useWorkspace.setState((s) => ({ cards: s.cards.map((c) => c.id === f ? { ...c, width: 1920, height: 600 } : c) }));
  useWorkspace.getState().resizeFrame(f, { width: 1920, height: 600 });
  useWorkspace.getState().resolveMembership([child]);
  await readyCheck(b);
  const startChild = { ...card(child) };
  const { container } = render(<ResizeHandles card={card(f)} measuredHeight={600} />);
  const el = container.querySelector('[data-resize-handle="nw"]')!;
  pointer(el, "pointerdown", 0, 0);
  pointer(window, "pointermove", 1000, 100);
  expect(card(f)).toMatchObject({ width: 920, height: 500, x: 1100, y: 200 });
  pointer(window, "pointermove", 0, 0);
  pointer(window, "pointerup", 0, 0);
  expect(note(f)).toMatchObject({ width: 1920, height: 600, x: 100, y: 100 });
  expect(card(child)).toEqual(startChild);
  expectGroupClosed();
});
it("photo NW touch resize anchors its opposite edges and original aspect", async () => {
  const b = await bootBoard();
  const id = useWorkspace.getState().addPhotoAt(100, 100, { ref: "photo", naturalW: 600, naturalH: 300 });
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  await readyCheck(b);
  const start = card(id);
  const { container } = render(<ResizeHandles card={start} measuredHeight={120} />);
  pointer(container.querySelector('[data-resize-handle="nw"]')!, "pointerdown", 0, 0);
  pointer(window, "pointermove", -100, -20);
  pointer(window, "pointerup", -100, -20);
  expect(note(id)).toMatchObject({ width: start.width + 100, height: start.height! + 50, x: 0, y: 50 });
  expectGroupClosed();
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(note(id)).toMatchObject({ width: start.width, height: start.height, x: 100, y: 100 });
});
it("desktop auto-height width grips sit below the center connection ports", () => {
  const c:Card={id:"a",kind:"textbox",x:0,y:0,width:240,content:"one line"};
  const {container}=render(<ResizeHandles card={c} measuredHeight={28}/>);
  const handle=container.querySelector<HTMLElement>('[data-resize-handle="e"]')!;
  expect(handle.style.top).toBe("");
  expect(handle.style.bottom).toBe("-24px");
  expect(handle.style.height).toBe("20px");
});
