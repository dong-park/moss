import { afterEach, beforeEach, expect, it } from "vitest";
import { useWorkspace } from "@/state/workspace";
import { serializeBlock } from "@/state/blocks";
import { EMPTY_LINK_CONTENT } from "../linkMemo";
import { resizeCardDimensions } from "../cardSizing";
import { addMemo, bootBoard, card, expectGroupClosed, note, pressUndo, readyCheck, setupNavigatorStorage, teardown, um } from "./undoTestKit";

beforeEach(() => setupNavigatorStorage());
afterEach(async () => { await teardown(); });

it("numeric paper sizing clamps, keeps square shape and creates one step per meaningful action", async () => {
  const b = await bootBoard();
  const id = addMemo(100, 100);
  await readyCheck(b);
  resizeCardDimensions(id, { width: 320, height: 700 });
  expect(note(id)).toMatchObject({ width: 320, height: 320, x: 100, y: 100 });
  expect(um().undoStack).toHaveLength(1);
  resizeCardDimensions(id, { width: 320, height: 800 }); // normalized no-op
  resizeCardDimensions(id, { width: NaN });
  resizeCardDimensions(id, { width: 600, height: Infinity });
  resizeCardDimensions("missing", { width: 400 });
  expect(um().undoStack).toHaveLength(1);
  resizeCardDimensions(id, { width: 9999 });
  expect(note(id)).toMatchObject({ width: 1200, height: 1200 });
  expect(um().undoStack).toHaveLength(2);
  expectGroupClosed();
  pressUndo();
  expect(note(id)?.width).toBe(320);
  pressUndo();
  expect(note(id)?.width).toBe(240);
});
it.each([
  ["todo", "- [ ] groceries", 88],
  ["short todo", "- [ ] groceries", 40],
  ["link", serializeBlock({ type: "link", url: "https://example.com", title: "example" })!, 88],
  ["short link", serializeBlock({ type: "link", url: "https://example.com", title: "example" })!, 40],
  ["empty link", EMPTY_LINK_CONTENT, 88],
] as const)("numeric %s resize preserves content-driven height instead of saving a square", async (_label, content, height) => {
  const b = await bootBoard();
  const id = addMemo(100, 100);
  useWorkspace.getState().setContent(id, content);
  useWorkspace.getState().setFaceHeight(id, height);
  await readyCheck(b);
  resizeCardDimensions(id, { width: 360, height: 500 });
  expect(card(id)).toMatchObject({ width: 360, height });
  expect(note(id)).toMatchObject({ width: 360, height });
  expect(um().undoStack).toHaveLength(1);
  expectGroupClosed();
  pressUndo();
  expect(note(id)?.width).toBe(240);
});
it("numeric textbox width is fixed once and ignores supplied height", async () => {
  const b = await bootBoard();
  const id = addMemo(100, 100, "textbox");
  useWorkspace.getState().setFaceHeight(id, 40);
  await readyCheck(b);
  const width = card(id).width;
  resizeCardDimensions(id, { width: width + 120, height: 500 });
  expect(note(id)).toMatchObject({ width: width + 120, height: 40, autoWidth: false });
  expect(um().undoStack).toHaveLength(1);
  resizeCardDimensions(id, { width: width + 120 });
  expect(um().undoStack).toHaveLength(1);
  pressUndo();
  expect(note(id)).toMatchObject({ width, autoWidth: true });
});
it("numeric photo width preserves its original aspect and both-axis limits", async () => {
  const b = await bootBoard();
  const id = useWorkspace.getState().addPhotoAt(100, 100, { ref: "photo", naturalW: 600, naturalH: 300 });
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  await readyCheck(b);
  resizeCardDimensions(id, { width: 800, height: 800 });
  expect(note(id)).toMatchObject({ width: 800, height: 400 });
  resizeCardDimensions(id, { width: 50 });
  expect(note(id)).toMatchObject({ width: 120, height: 60 });
  expect(um().undoStack).toHaveLength(2);
  pressUndo();
  expect(note(id)).toMatchObject({ width: 800, height: 400 });
});
it("numeric frame dimensions are independent, with membership in the same undo step", async () => {
  const b = await bootBoard();
  const f = useWorkspace.getState().addFrameAt(0, 0);
  const id = addMemo(500, 20);
  await readyCheck(b);
  resizeCardDimensions(f, { width: 920, height: 300 });
  expect(note(f)).toMatchObject({ width: 920, height: 300 });
  expect(note(id)?.frameId).toBe(f);
  expect(um().undoStack).toHaveLength(1);
  expectGroupClosed();
  pressUndo();
  expect(note(f)).toMatchObject({ width: 320, height: 220 });
  expect(note(id)?.frameId).toBeUndefined();
});
it("background frame keeps its existing image-fit semantics; ignored height changes are no-ops", async () => {
  const b = await bootBoard();
  const id = useWorkspace.getState().addFrameAt(100, 100);
  useWorkspace.getState().setFrameBackground(id, { ref: "photo", mediaType: "image/png", w: 600, h: 300 });
  await readyCheck(b);
  expect(note(id)).toMatchObject({ width: 320, height: 160 });
  resizeCardDimensions(id, { width: 320, height: 800 });
  expect(um().undoStack).toHaveLength(0);
  resizeCardDimensions(id, { width: 800, height: 800 });
  expect(note(id)).toMatchObject({ width: 800, height: 400 });
  expect(um().undoStack).toHaveLength(1);
});
