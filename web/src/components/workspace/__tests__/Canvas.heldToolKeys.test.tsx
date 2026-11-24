import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { resetCollabStore } from "@/state/collab";

// wall-marker n2 (T6·T10): 마카·천을 든 동안의 키 — Esc 내려놓기, ⌘Z·⇧⌘Z 마카 기록 되돌리기.
// 실제 Canvas 키 핸들러와 스토어 액션을 탄다.

let originalStorage: PropertyDescriptor | undefined;

beforeEach(async () => {
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
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    heldTool: null,
    markerUndoStack: [],
    markerRedoStack: [],
    textPlacementArmed: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await resetDB();
  resetCollabStore();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    heldTool: null,
    markerUndoStack: [],
    markerRedoStack: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
  });
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
  return utils.container.querySelector<HTMLElement>('[data-canvas-root="true"]')!;
}

const ov = (n: number) => JSON.stringify({ paths: [[{ x: n, y: n }]] });
const overlayOf = (id: string) => useWorkspace.getState().cards.find((c) => c.id === id)?.overlay ?? "";

describe("마카·천을 든 동안의 키", () => {
  it("Esc를 누르면 든 마카가 내려놓인다 (T6)", async () => {
    await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("blue"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("Esc를 누르면 든 천도 내려놓인다", async () => {
    await mountCanvas();
    act(() => useWorkspace.getState().holdCloth());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("마카를 든 동안 ⌘Z는 마카 기록을 되돌리고 ⇧⌘Z는 다시 한다 (T10)", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await mountCanvas();
    act(() => {
      useWorkspace.getState().holdMarker("black");
      useWorkspace.getState().setOverlay(id, ov(1));
      useWorkspace.getState().setOverlay(id, ov(2));
    });
    // setOverlay가 글 편집을 시작하지는 않는다 — 마카는 그대로 들려 있다.
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "black" });

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(overlayOf(id)).toBe(ov(1));
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(overlayOf(id)).toBe("");
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(overlayOf(id)).toBe(ov(1));
  });

  it("천을 든 동안에도 ⌘Z가 마카 기록을 되돌린다", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await mountCanvas();
    act(() => {
      useWorkspace.getState().setOverlay(id, ov(7));
      useWorkspace.getState().holdCloth();
    });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(overlayOf(id)).toBe("");
  });

  it("아무것도 안 들었으면 ⌘Z가 마카 기록을 건드리지 않는다 (D9=A)", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    await mountCanvas();
    act(() => useWorkspace.getState().setOverlay(id, ov(3)));
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(overlayOf(id)).toBe(ov(3));
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(1);
  });

  it("옛 펜 키(E·[·])는 더 이상 도구를 바꾸지 않는다", async () => {
    await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("red"));
    const w = useWorkspace.getState().markerWidth;
    for (const key of ["e", "[", "]"]) fireEvent.keyDown(window, { key });
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "red" });
    expect(useWorkspace.getState().markerWidth).toBe(w);
  });

  it("들고 있으면 벽 포인터가 마카 모양으로 바뀐다 (T2)", async () => {
    const root = await mountCanvas();
    expect(root.style.cursor).toBe("");
    act(() => useWorkspace.getState().holdMarker("blue"));
    expect(root.style.cursor).toContain("url(");
    expect(decodeURIComponent(root.style.cursor)).toContain("#2457b8"); // 파랑 마카 색
  });
});
