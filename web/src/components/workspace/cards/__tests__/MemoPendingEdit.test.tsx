import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MemoExpandDialog } from "../MemoExpandDialog";
import { useStorage } from "@/state/storage";
import { getOrOpenBoardDoc, isActiveBoard } from "@/state/ydoc/activeDoc";
import { setupNavigatorStorage, bootBoard, addMemo, ws, teardown, sleep } from "../../__tests__/undoTestKit";

const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");

beforeEach(() => {
  setupNavigatorStorage();
  // jsdom has no Range geometry. Only stub measurement, not editor transactions.
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
});
afterEach(async () => {
  cleanup();
  await teardown();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalRects) Object.defineProperty(Range.prototype, "getClientRects", originalRects);
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
  if (originalRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", originalRect);
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

async function setup(width = 390) {
  vi.stubGlobal("innerWidth", width);
  const board = await bootBoard("pending edit");
  const id = addMemo(0, 0);
  ws().setContent(id, "before");
  const result = render(<I18nProvider locale="ko"><MemoExpandDialog /></I18nProvider>);
  act(() => ws().setExpandedCard(id, width === 390 ? "edit" : undefined));
  await waitFor(() => expect(document.querySelector(".ProseMirror p")).toBeTruthy());
  // Finish mount notifications, then leave an actual DOM edit inside the
  // listener's 200ms debounce. No textarea or editor mock substitutes here.
  await act(() => sleep(300));
  return { ...result, board, id };
}

async function typePending() {
  const paragraph = document.querySelector(".ProseMirror p")!;
  await act(async () => {
    (paragraph.firstChild as Text).data = "before pending";
    await sleep(20);
  });
}

it("keeps the same editor and pending text when desktop becomes compact", async () => {
  const { id } = await setup(1280);
  const editor = document.querySelector(".ProseMirror");
  await typePending();
  act(() => { vi.stubGlobal("innerWidth", 390); window.dispatchEvent(new Event("resize")); });
  await act(() => sleep(300));
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
  expect(document.querySelector(".ProseMirror")).toBe(editor);
  expect(editor?.getAttribute("contenteditable")).toBe("true");
});

it("flushes pending text before the actual dialog unmounts", async () => {
  const { id, unmount } = await setup();
  await typePending();
  unmount();
  await act(() => sleep(300));
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
});

it("keeps the last pending body input when Done closes the mobile editor", async () => {
  const { id } = await setup();
  await typePending();
  fireEvent.click(screen.getByRole("button", { name: "완료" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
});

it("opens the requested card's own body after an immediate close and reopen", async () => {
  const { id } = await setup();
  let next!: string;
  act(() => { next = addMemo(300, 0); ws().setContent(next, "next memo body"); });
  await typePending();
  fireEvent.click(screen.getByRole("button", { name: "완료" }));
  act(() => ws().setExpandedCard(next, "edit"));
  await waitFor(() => expect(document.querySelector(".ProseMirror")?.textContent).toContain("next memo body"));
  expect(ws().expandedCardId).toBe(next);
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
});

it("flushes to the source board before setCurrentBoard replaces its cards", async () => {
  const { id, board } = await setup();
  // Prepare the target before typing so database work cannot consume the debounce.
  const target = await act(() => ws().createBoard("target"));
  await act(() => ws().setCurrentBoard(board));
  act(() => ws().setExpandedCard(id, "edit"));
  await waitFor(() => expect(document.querySelector(".ProseMirror p")).toBeTruthy());
  await act(() => sleep(300));
  await typePending();
  await act(() => ws().setCurrentBoard(target));
  await act(() => sleep(300));
  await act(() => ws().setCurrentBoard(board));
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
});

it("keeps input entered while the destination board is still loading", async () => {
  const { id, board } = await setup();
  const target = await act(() => ws().createBoard("slow target"));
  await act(() => ws().setCurrentBoard(board));
  act(() => ws().setExpandedCard(id, "edit"));
  await waitFor(() => expect(document.querySelector(".ProseMirror p")).toBeTruthy());
  await act(() => sleep(300));
  const boards = await useStorage.getState().loadBoards();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(useStorage.getState(), "loadBoards").mockImplementationOnce(async () => {
    await gate;
    return boards;
  });
  let switching!: Promise<void>;
  act(() => { switching = ws().setCurrentBoard(target); });
  await typePending();
  await act(async () => { release(); await switching; });
  await act(() => ws().setCurrentBoard(board));
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
});

it("keeps the source editor usable after a destination load failure and allows retry", async () => {
  const { id, board } = await setup();
  const target = await act(() => ws().createBoard("retry target"));
  await act(() => ws().setCurrentBoard(board));
  act(() => ws().setExpandedCard(id, "edit"));
  await waitFor(() => expect(document.querySelector(".ProseMirror p")).toBeTruthy());
  await act(() => sleep(300));
  const failed = getOrOpenBoardDoc(target);
  await failed.whenLoaded;
  // Only the destination's local load fails; keep the real document cache,
  // workspace transition, editor and persistence paths in this regression.
  failed.whenLoaded = Promise.reject(new Error("destination open failed"));
  void failed.whenLoaded.catch(() => {});
  await act(async () => {
    await expect(ws().setCurrentBoard(target)).rejects.toThrow("destination open failed");
  });
  expect(ws().currentBoardId).toBe(board);
  expect(isActiveBoard(board)).toBe(true);
  expect(ws().expandedCardId).toBe(id);
  await typePending();
  await act(() => ws().setCurrentBoard(target));
  expect(ws().currentBoardId).toBe(target);
  expect(isActiveBoard(target)).toBe(true);
  expect(getOrOpenBoardDoc(target)).not.toBe(failed);
  await act(() => ws().setCurrentBoard(board));
  expect(ws().cards.find((card) => card.id === id)?.content).toContain("pending");
});
