/**
 * wall-marker n1 (D1=A) — 벽 획 저장소: 스토어 액션 → Y.Doc(유일한 원본).
 * 실경로: 액션으로 만든 획이 새로 부팅한 스토어에서 같은 모양으로 읽힌다.
 * (리뷰 W5: Dexie `strokes` 미러는 걷어 냈다 — 저장소가 둘이라 생기던 틈이 없다.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { getDB, resetDB } from "@/state/db/schema";
import {
  activateBoardDoc,
  destroyBoardDocs,
  getActiveBoardDoc,
  getOrOpenBoardDoc,
} from "@/state/ydoc/activeDoc";
import { readStroke, readStrokes, strokesMap, strokeToYMap } from "@/state/ydoc/model";
import { flushAll } from "@/state/cardPersist";
import { useToasts } from "@/state/notifications";
import { blockWallInput } from "@/state/marker/inputGate";

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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await new Promise((r) => setTimeout(r, 10));
  await flushAll();
  await destroyBoardDocs();
  await resetDB();
  useToasts.getState().clear();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    wallStrokes: [],
    selectedIds: [],
    editingId: null,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
    viewport: { x: 0, y: 0, scale: 1 },
    pendingBoardUndo: null,
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

describe("addWallStroke — 화면·문서", () => {
  it("획 하나가 화면에 바로 오르고 문서에 즉시 쓰인다", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({
      points: line(0, 0, 40, 40),
      color: "red",
      width: "thick",
    })!;
    expect(s.boardId).toBe(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().wallStrokes).toEqual([s]);

    const doc = getActiveBoardDoc()!.doc;
    expect(readStroke(doc, s.id)).toEqual(s);
  });

  it("벽 획 저장소는 문서 하나뿐이다 — Dexie에 strokes 테이블이 없다", async () => {
    await boot();
    expect(getDB().tables.map((t) => t.name)).not.toContain("strokes");
  });

  it("점이 없으면 만들지 않는다", async () => {
    await boot();
    expect(useWorkspace.getState().addWallStroke({ points: [], color: "black", width: "thin" })).toBeNull();
    expect(useWorkspace.getState().wallStrokes).toEqual([]);
  });

  it("실경로: 새로 부팅한 스토어가 같은 획을 문서에서 읽는다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(1, 2, 3, 4), color: "blue", width: "mid" })!;
    const b = useWorkspace.getState().addWallStroke({ points: line(5, 6, 7, 8), color: "green", width: "thin" })!;
    await flushAll();

    // 새로고침: 열린 문서를 모두 닫아(y-indexeddb에서만 복원되게) 스토어를 비운 뒤 다시 부팅.
    await destroyBoardDocs();
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], wallStrokes: [], currentBoardId: SYSTEM_BOARD_ID });
    await boot();

    const loaded = useWorkspace.getState().wallStrokes;
    expect(loaded.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(loaded[0]).toEqual(a);
    expect(loaded[1]).toEqual(b);
  });
});

describe("replace · move · remove", () => {
  it("지우개 쪼개기: 원본이 사라지고 조각이 생긴다(문서 갱신 한 번)", async () => {
    await boot();
    const whole = useWorkspace.getState().addWallStroke({ points: line(0, 0, 100, 0), color: "red", width: "mid" })!;
    const doc = getActiveBoardDoc()!.doc;
    let updates = 0;
    doc.on("update", () => updates++);

    const pieces = useWorkspace.getState().replaceWallStrokes(
      [whole.id],
      [
        { points: line(0, 0, 40, 0), color: "red", width: "mid" },
        { points: line(60, 0, 100, 0), color: "red", width: "mid" },
      ],
    );
    expect(updates).toBe(1);
    expect(pieces).toHaveLength(2);
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual(pieces.map((x) => x.id));
    expect(readStrokes(doc).map((x) => x.id).sort()).toEqual(pieces.map((x) => x.id).sort());
  });

  it("옮기기: 점이 평행 이동하고 색·굵기·id는 그대로다", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({ points: line(0, 0, 10, 10), color: "green", width: "thick" })!;
    useWorkspace.getState().moveWallStrokes([s.id], 5, -3);
    const moved = useWorkspace.getState().wallStrokes[0];
    expect(moved.points).toEqual(line(5, -3, 15, 7));
    expect(moved.id).toBe(s.id);
    expect(moved.color).toBe("green");
    expect(moved.width).toBe("thick");
    expect(readStroke(getActiveBoardDoc()!.doc, s.id)?.points).toEqual(line(5, -3, 15, 7));
  });

  it("지우기: 모르는 id는 건너뛰고 문서에서도 사라진다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 1, 1), color: "black", width: "thin" })!;
    const b = useWorkspace.getState().addWallStroke({ points: line(2, 2, 3, 3), color: "black", width: "thin" })!;
    useWorkspace.getState().removeWallStrokes([a.id, "nope"]);
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([b.id]);
    expect(readStroke(getActiveBoardDoc()!.doc, a.id)).toBeUndefined();
  });
});

describe("공유 보드 — 원격 반영 (T11)", () => {
  it("다른 기기가 그은 획이 화면에 보이고 내 획도 남는다", async () => {
    await boot();
    const mine = useWorkspace.getState().addWallStroke({ points: line(0, 0, 1, 1), color: "red", width: "thin" })!;
    const doc = getActiveBoardDoc()!.doc;

    doc.transact(() => {
      strokesMap(doc).set(
        "remote-1",
        strokeToYMap({
          id: "remote-1",
          boardId: SYSTEM_BOARD_ID,
          points: line(9, 9, 20, 20),
          color: "blue",
          width: "mid",
          createdAt: Date.now() + 1,
          updatedAt: Date.now() + 1,
        }),
      );
    }, { kind: "remote" });

    const ids = useWorkspace.getState().wallStrokes.map((x) => x.id);
    expect(ids).toEqual([mine.id, "remote-1"]);
  });

  it("다른 기기가 지운 획은 화면에서도 지워진다", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({ points: line(0, 0, 1, 1), color: "red", width: "thin" })!;
    const doc = getActiveBoardDoc()!.doc;
    doc.transact(() => strokesMap(doc).delete(s.id), { kind: "remote" });
    expect(useWorkspace.getState().wallStrokes).toEqual([]);
  });

  it("내가 낸 변경은 되돌아와 한 번 더 반영되지 않는다", async () => {
    await boot();
    let sets = 0;
    const unsub = useWorkspace.subscribe((s, prev) => {
      if (s.wallStrokes !== prev.wallStrokes) sets++;
    });
    useWorkspace.getState().addWallStroke({ points: line(0, 0, 1, 1), color: "red", width: "thin" });
    unsub();
    expect(sets).toBe(1);
  });
});

describe("보드 전환 중·첫 벽 공유 이동 중에는 쓰지 않는다 (W5)", () => {
  it("활성 문서가 이미 다른 보드인 전환 창에서 commit하면 화면·문서 어디에도 반쪽으로 남지 않는다", async () => {
    await boot();
    // 다른 보드를 만들어 두고 현재 보기는 첫 벽(currentBoardId)인 채로 문서만 그쪽으로 옮겨 놓는다 —
    // setCurrentBoard가 문서를 활성화한 뒤 currentBoardId를 바꾸기 전의 창이다.
    const other = await useWorkspace.getState().createBoard("다른 보드");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().currentBoardId).toBe(SYSTEM_BOARD_ID);
    await activateBoardDoc(other);

    const r = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "red", width: "thin" });

    expect(r).toBeNull();
    expect(useWorkspace.getState().wallStrokes).toEqual([]);
    expect(readStrokes(getOrOpenBoardDoc(other).doc)).toEqual([]);
    expect(readStrokes(getOrOpenBoardDoc(SYSTEM_BOARD_ID).doc)).toEqual([]);
    // 기록에도 안 쌓인다(WallStrokeLayer는 null이면 기록하지 않는다) — 되돌릴 것이 없다.
    expect(useWorkspace.getState().markerUndoStack).toEqual([]);
  });

  it("옮기기·지우기·교체도 같은 창에서 화면을 바꾸지 않는다", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "red", width: "thin" })!;
    const other = await useWorkspace.getState().createBoard("다른 보드");
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    const before = useWorkspace.getState().wallStrokes;
    expect(before.map((x) => x.id)).toEqual([s.id]);
    await activateBoardDoc(other);

    useWorkspace.getState().moveWallStrokes([s.id], 10, 10);
    useWorkspace.getState().removeWallStrokes([s.id]);
    const r = useWorkspace.getState().replaceWallStrokes([s.id], [
      { points: line(1, 1, 2, 2), color: "red", width: "thin" },
    ]);

    expect(r).toEqual([]);
    expect(useWorkspace.getState().wallStrokes).toBe(before);
  });

  it("첫 벽 공유 이동 중(입력 차단)에는 새 획·되돌리기가 받아들여지지 않고, 끝나면 다시 받는다", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "red", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [s] });

    const release = blockWallInput();
    expect(
      useWorkspace.getState().addWallStroke({ points: line(1, 1, 2, 2), color: "red", width: "thin" }),
    ).toBeNull();
    // 되돌리기도 쓰지 않는다 — 기록은 그대로 남는다.
    useWorkspace.getState().markerUndo();
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([s.id]);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(1);

    release();
    expect(
      useWorkspace.getState().addWallStroke({ points: line(1, 1, 2, 2), color: "red", width: "thin" }),
    ).not.toBeNull();
  });
});

describe("보드 삭제와 5초 되살리기", () => {
  it("보드를 지웠다 되살리면 같은 획이 돌아온다(원본 문서는 그대로다)", async () => {
    await boot();
    const boardId = await useWorkspace.getState().createBoard("그림 보드");
    expect(useWorkspace.getState().currentBoardId).toBe(boardId);
    const s = useWorkspace.getState().addWallStroke({ points: line(0, 0, 9, 9), color: "blue", width: "mid" })!;
    expect(s.boardId).toBe(boardId);
    await flushAll();

    await useWorkspace.getState().removeBoardWithUndo(boardId);
    // 지운 보드에서 시스템 보드로 돌아왔으니 화면 획은 시스템 보드 것(없음)이다.
    expect(useWorkspace.getState().wallStrokes).toEqual([]);

    await useWorkspace.getState().undoBoardRemove();

    // 되살린 보드를 열면 같은 획이 같은 자리에 보인다.
    await useWorkspace.getState().setCurrentBoard(boardId);
    expect(useWorkspace.getState().wallStrokes).toEqual([s]);
  });

  it("보드마다 획이 따로다 — 보드를 바꾸면 그 보드의 획만 보인다", async () => {
    await boot();
    const sys = useWorkspace.getState().addWallStroke({ points: line(0, 0, 1, 1), color: "black", width: "thin" })!;
    const other = await useWorkspace.getState().createBoard("다른 보드");
    expect(useWorkspace.getState().wallStrokes).toEqual([]);
    const mine = useWorkspace.getState().addWallStroke({ points: line(2, 2, 3, 3), color: "red", width: "thin" })!;
    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([sys.id]);
    await useWorkspace.getState().setCurrentBoard(other);
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([mine.id]);
  });
});
