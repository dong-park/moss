/**
 * wall-marker 리뷰 W8 — 손에 든 도구(마카·천)·글상자 배치(T)·글 편집·벽 획 묶음은 서로 배타다.
 * 한쪽에 들어가는 모든 진입이 같은 헬퍼를 거쳐, 어떤 순서로 눌러도 불가능한 조합이 안 생긴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";
import { flushAll } from "@/state/cardPersist";

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
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true, writable: true });
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  useWorkspace.setState({
    cards: [
      { id: "memo", kind: "text", x: 0, y: 0, width: 240, content: "" },
      { id: "box", kind: "textbox", x: 300, y: 0, width: 240, content: "x" },
    ],
    wallStrokes: [
      { id: "w1", boardId: SYSTEM_BOARD_ID, points: [{ x: 1, y: 1 }], color: "black", width: "thin", createdAt: 1, updatedAt: 1 },
      { id: "w2", boardId: SYSTEM_BOARD_ID, points: [{ x: 5, y: 5 }], color: "black", width: "thin", createdAt: 2, updatedAt: 2 },
    ],
    selectedIds: [],
    selectedWallStrokeIds: [],
    editingId: null,
    heldTool: null,
    textPlacementArmed: false,
  });
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    wallStrokes: [],
    selectedIds: [],
    selectedWallStrokeIds: [],
    editingId: null,
    heldTool: null,
    textPlacementArmed: false,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

const s = () => useWorkspace.getState();

/** 불가능한 조합이 없다. */
function expectConsistent() {
  const { heldTool, textPlacementArmed, editingId, selectedWallStrokeIds } = s();
  if (heldTool !== null) {
    expect(textPlacementArmed).toBe(false);
    expect(editingId).toBeNull();
    expect(selectedWallStrokeIds).toEqual([]);
  }
  if (textPlacementArmed) {
    expect(heldTool).toBeNull();
    expect(editingId).toBeNull();
    expect(selectedWallStrokeIds).toEqual([]);
  }
  if (editingId !== null) {
    expect(heldTool).toBeNull();
    expect(textPlacementArmed).toBe(false);
  }
  if (selectedWallStrokeIds.length > 0) {
    expect(heldTool).toBeNull();
    expect(textPlacementArmed).toBe(false);
  }
}

describe("진입 순서가 달라도 한쪽만 켜진다", () => {
  it("T 배치 뒤 마카를 집으면 배치가 풀린다 — 첫 클릭이 글상자를 만들지 않는다", () => {
    s().armTextPlacement();
    s().holdMarker("red");
    expect(s().heldTool).toEqual({ kind: "marker", color: "red" });
    expect(s().textPlacementArmed).toBe(false);
  });

  it("T 배치 뒤 천을 집어도 마찬가지다", () => {
    s().armTextPlacement();
    s().holdCloth();
    expect(s().heldTool).toEqual({ kind: "cloth" });
    expect(s().textPlacementArmed).toBe(false);
  });

  it("마카를 든 뒤 T 배치에 들어가면 마카가 내려진다", () => {
    s().holdMarker("blue");
    s().armTextPlacement();
    expect(s().heldTool).toBeNull();
    expect(s().textPlacementArmed).toBe(true);
  });

  it("T 배치 중 글 편집에 들어가면 배치가 풀린다", () => {
    s().armTextPlacement();
    s().setEditing("box");
    expect(s().editingId).toBe("box");
    expect(s().textPlacementArmed).toBe(false);
  });

  it("마카를 든 채 글 편집에 들어가면(키보드 편집 진입 포함) 마카가 내려진다", () => {
    s().holdMarker("black");
    s().selectMany(["box"], false);
    s().enterEditOnSelected();
    expect(s().editingId).toBe("box");
    expect(s().heldTool).toBeNull();
  });

  it("T 배치 중에는 벽 획을 고를 수 없다", () => {
    s().armTextPlacement();
    s().selectWallStrokes(["w1"]);
    expect(s().selectedWallStrokeIds).toEqual([]);
  });

  it("벽 획을 고른 채 T 배치에 들어가면 묶음이 풀린다", () => {
    s().selectWallStrokes(["w1", "w2"]);
    expect(s().selectedWallStrokeIds).toEqual(["w1", "w2"]);
    s().armTextPlacement();
    expect(s().selectedWallStrokeIds).toEqual([]);
  });

  it("카드를 새로 만들어 편집에 들어갈 때도 든 마카가 내려진다", () => {
    s().holdMarker("green");
    s().addCardAt("textbox", 100, 100);
    expect(s().editingId).not.toBeNull();
    expect(s().heldTool).toBeNull();
  });
});

describe("무작위 진입 순서에서도 불가능한 조합이 없다", () => {
  it("2,000 걸음 뒤에도 불변식이 지켜진다", () => {
    let seed = 20261012;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const actions: Array<() => void> = [
      () => s().holdMarker("red"),
      () => s().holdMarker("blue"),
      () => s().holdCloth(),
      () => s().releaseTool(),
      () => s().armTextPlacement(),
      () => s().disarmTextPlacement(),
      () => s().setEditing("box"),
      () => s().setEditing("memo"),
      () => s().setEditing(null),
      () => s().selectWallStrokes(["w1"]),
      () => s().selectWallStrokes(["w1", "w2"]),
      () => s().selectWallStrokes([]),
      () => {
        s().selectMany(["box"], false);
        s().enterEditOnSelected();
      },
      () => s().addCardAt("textbox", rnd() * 500, rnd() * 500),
    ];
    for (let i = 0; i < 2000; i++) {
      actions[Math.floor(rnd() * actions.length)]();
      expectConsistent();
    }
  });
});
