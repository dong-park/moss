/**
 * wall-marker 리뷰 W10 — 쌓임 순서·id·보드. 비교자는 한 곳(model.compareStrokeOrder), 지우개 조각과
 * 되돌려 복원된 획은 원본 createdAt을 이어받아 귀퉁이를 지워도 위로 튀지 않고, 원격 획의 boardId는
 * 반영할 때 이 문서의 보드로 덮는다. frameId는 쓰고 읽는 곳이 없어 스키마에서 뺐다.
 */
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import type { WallStroke } from "@/state/db/schema";
import { destroyBoardDocs, getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import {
  compareStrokeOrder,
  putStroke,
  readStroke,
  strokesMap,
  strokeToYMap,
} from "@/state/ydoc/model";
import { flushAll } from "@/state/cardPersist";

let originalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
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
    markerUndoStack: [],
    markerRedoStack: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

async function boot() {
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
}

const line = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];
const ids = () => useWorkspace.getState().wallStrokes.map((s) => s.id);

describe("compareStrokeOrder", () => {
  it("createdAt 오름차순, 같으면 id 사전순", () => {
    const mk = (id: string, createdAt: number) => ({ id, createdAt }) as WallStroke;
    const sorted = [mk("b", 2), mk("z", 1), mk("a", 2), mk("c", 1)].sort(compareStrokeOrder);
    expect(sorted.map((s) => s.id)).toEqual(["c", "z", "a", "b"]);
  });
});

describe("원본 createdAt을 이어받는다", () => {
  it("지우개로 맨 아래 획의 귀퉁이를 지워도 조각이 위 획들 위로 튀지 않는다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 100, 0), color: "red", width: "mid" })!;
    const b = useWorkspace.getState().addWallStroke({ points: line(0, 20, 100, 20), color: "blue", width: "mid" })!;
    const c = useWorkspace.getState().addWallStroke({ points: line(0, 40, 100, 40), color: "green", width: "mid" })!;
    expect(ids()).toEqual([a.id, b.id, c.id]);

    const pieces = useWorkspace.getState().replaceWallStrokes(
      [a.id],
      [
        { points: line(0, 0, 30, 0), color: "red", width: "mid", createdAt: a.createdAt },
        { points: line(60, 0, 100, 0), color: "red", width: "mid", createdAt: a.createdAt },
      ],
    );

    expect(pieces.map((p) => p.createdAt)).toEqual([a.createdAt, a.createdAt]);
    // 조각 둘이 b·c 아래에 그대로 있다.
    expect(ids().slice(-2)).toEqual([b.id, c.id]);
    expect(ids().slice(0, 2).sort()).toEqual(pieces.map((p) => p.id).sort());
  });

  it("지우기를 되돌리면 원본이 원래 쌓임 자리(b·c 아래)로 돌아온다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 100, 0), color: "red", width: "mid" })!;
    const b = useWorkspace.getState().addWallStroke({ points: line(0, 20, 100, 20), color: "blue", width: "mid" })!;
    const pieces = useWorkspace.getState().replaceWallStrokes(
      [a.id],
      [{ points: line(0, 0, 30, 0), color: "red", width: "mid", createdAt: a.createdAt }],
    );
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [a], after: pieces });

    useWorkspace.getState().markerUndo();

    expect(ids()).toEqual([a.id, b.id]);
    expect(useWorkspace.getState().wallStrokes[0].createdAt).toBe(a.createdAt);
  });

  it("createdAt을 안 주면 지금 시각으로 쌓는다(맨 위)", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 10, 0), color: "red", width: "mid" })!;
    const [p] = useWorkspace.getState().replaceWallStrokes(
      [],
      [{ points: line(0, 5, 10, 5), color: "blue", width: "mid" }],
    );
    expect(ids()).toEqual([a.id, p.id]);
    expect(p.createdAt).toBeGreaterThan(a.createdAt);
  });
});

describe("원격 획의 boardId는 이 문서의 보드로 덮는다", () => {
  it("원격이 다른 boardId를 적어 보내도 화면의 획은 이 보드 것이다", async () => {
    await boot();
    const doc = getActiveBoardDoc()!.doc;
    doc.transact(() => {
      strokesMap(doc).set(
        "remote-1",
        strokeToYMap({
          id: "remote-1",
          boardId: "some-other-board",
          points: line(1, 1, 9, 9),
          color: "blue",
          width: "mid",
          createdAt: Date.now() + 5,
          updatedAt: Date.now() + 5,
        }),
      );
    }, { kind: "remote" });
    const s = useWorkspace.getState().wallStrokes.find((x) => x.id === "remote-1")!;
    expect(s.boardId).toBe(SYSTEM_BOARD_ID);
  });

  it("다시 불러올 때도 문서의 보드로 덮는다", async () => {
    await boot();
    const doc = getActiveBoardDoc()!.doc;
    putStroke(doc, {
      id: "legacy",
      boardId: "some-other-board",
      points: line(0, 0, 3, 3),
      color: "red",
      width: "thin",
      createdAt: 1,
      updatedAt: 1,
    });
    await useWorkspace.getState().loadFromStorage();
    expect(useWorkspace.getState().wallStrokes.find((x) => x.id === "legacy")?.boardId).toBe(SYSTEM_BOARD_ID);
  });
});

describe("frameId는 스키마에서 빠졌다", () => {
  it("문서에 frameId가 적혀 와도 읽지 않고, 쓰지도 않는다", () => {
    const doc = new Y.Doc();
    const m = strokeToYMap({
      id: "s",
      boardId: "b",
      points: line(0, 0, 1, 1),
      color: "red",
      width: "thin",
      createdAt: 1,
      updatedAt: 1,
      // 옛 데이터·낯선 피어가 넣은 값
      frameId: "frame-9",
    } as WallStroke);
    expect(m.has("frameId")).toBe(false);
    strokesMap(doc).set("s", m);
    // 원격이 키를 직접 더했다.
    m.set("frameId", "frame-9");
    expect(readStroke(doc, "s")).not.toHaveProperty("frameId");
  });
});
