/**
 * cmd-z-undo n4 — 화면 수준 묶음 시험 공용 도우미(DraggableCard·ResizeHandles).
 *
 * 화면 시험도 보드 문서와 UndoManager가 열린 상태에서 준비 확인을 한 뒤 시작한다:
 * 준비 → getter로 clear → 실제 시간 0.6초 → 지금 보드와 undoStack 0.
 */
import { expect, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID, __resetBoardDocsForTest, type Card } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import { readNote } from "@/state/ydoc/model";
import { getBoardUndoGroupState, getBoardUndoManager } from "@/state/ydoc/undo";
import { __resetLiveSyncForTest } from "@/state/db/liveSync";
import { handleUndoKeyDown } from "@/components/workspace/undoKeys";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const ws = () => useWorkspace.getState();
export const doc = () => getActiveBoardDoc()!.doc;
export const um = () => getBoardUndoManager()!;
export const note = (id: string) => readNote(doc(), id);
export const card = (id: string): Card => ws().cards.find((c) => c.id === id)!;

let originalStorage: PropertyDescriptor | undefined;

export function setupNavigatorStorage() {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(async () => ({ removeEntry: vi.fn(async () => {}) })),
    },
    configurable: true,
    writable: true,
  });
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
}

export async function teardown() {
  vi.useRealTimers();
  await sleep(20);
  await flushAll();
  await __resetBoardDocsForTest();
  __resetLiveSyncForTest();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    connections: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    penMode: false,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    boardTransitioning: false,
    migrationPending: false,
    draggingId: null,
    draggingMulti: false,
    dropTargetFunnelId: null,
    dropTargetCrumbId: null,
    dropTargetTrash: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  document.body.innerHTML = "";
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
}

/** 새 보드 P를 만들어 연다. */
export async function bootBoard(name = "P"): Promise<string> {
  await useStorage.getState().init();
  await ws().loadFromStorage();
  return ws().createBoard(name);
}

/** 준비 확인 — clear, 실제 시간 0.6초, 지금 보드와 undoStack 0. */
export async function readyCheck(boardId: string) {
  await flushAll();
  um().clear();
  await sleep(600);
  expect(ws().currentBoardId).toBe(boardId);
  expect(getBoardUndoManager()).not.toBeNull();
  expect(um().undoStack.length).toBe(0);
}

/** 길이 끝난 뒤 묶음 깊이 0, captureTimeout 500. */
export function expectGroupClosed() {
  expect(getBoardUndoGroupState()).toEqual({ depth: 0, captureTimeout: 500 });
}

/** 실제 시간 조건 대기 — 최대 2초. */
export async function waitFor(cond: () => boolean | Promise<boolean>, label = "조건") {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > 2000) throw new Error(`${label}: 2초 안에 서지 않음`);
    await sleep(20);
  }
}

export function addMemo(x: number, y: number, kind: "text" | "textbox" = "text"): string {
  const id = ws().addCardAt(kind, x, y);
  useWorkspace.setState({ editingId: null, selectedIds: [] });
  return id;
}

export function pressUndo(shift = false) {
  return handleUndoKeyDown({ key: "z", code: "KeyZ", metaKey: true, ctrlKey: false, shiftKey: shift });
}

/** elementsFromPoint가 돌려줄 요소 목록. jsdom엔 이 API가 없다. */
export function under(els: Element[]) {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => els;
}
