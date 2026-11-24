/**
 * wall-marker 리뷰 W2 — 입력·쓰기 상한. 읽을 때만 자르면 "다시 열면 잘려 보이고, 옮기면 잘린
 * 모양이 영구 기록"된다. 확정할 때 같은 상한을 적용해(점은 솎는다) 쓴 것과 읽은 것이 같다.
 */
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { destroyBoardDocs, getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import { readStroke, readStrokes, strokesMap } from "@/state/ydoc/model";
import { flushAll } from "@/state/cardPersist";
import {
  BOARD_COORD_MAX,
  MAX_OVERLAY_CHARS,
  MAX_OVERLAY_STROKES,
  MAX_STROKE_POINTS,
  MAX_STROKE_POINTS_CHARS,
  MAX_WALL_STROKES,
  thinToMax,
} from "@/state/marker/limits";
import { parseStrokes, serializeStrokes } from "@/state/cardContent";

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

const ramp = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i % 7 }));

describe("thinToMax", () => {
  it("상한 이하면 그대로, 넘으면 첫·끝 점을 남기고 고르게 솎는다", () => {
    const small = ramp(10);
    expect(thinToMax(small, 20)).toBe(small);
    const big = ramp(1000);
    const out = thinToMax(big, 100);
    expect(out).toHaveLength(100);
    expect(out[0]).toEqual(big[0]);
    expect(out[99]).toEqual(big[999]);
    // 순서가 유지된다.
    for (let i = 1; i < out.length; i++) expect(out[i].x).toBeGreaterThan(out[i - 1].x);
  });
});

describe("쓰기 상한 — 벽 획", () => {
  it("상한을 넘는 점은 앞에서 자르지 않고 솎아서 쓴다 — 화면·문서가 같은 모양", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({
      points: ramp(MAX_STROKE_POINTS + 500),
      color: "black",
      width: "thin",
    })!;
    expect(s.points.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    // 끝 점(마지막에 그은 자리)이 남는다 — 앞에서 자르면 사라진다.
    expect(s.points[s.points.length - 1]).toEqual({ x: MAX_STROKE_POINTS + 499, y: (MAX_STROKE_POINTS + 499) % 7 });
    const doc = getActiveBoardDoc()!.doc;
    expect(readStroke(doc, s.id)!.points).toEqual(s.points);
  });

  it("비유한·한계 밖 좌표는 쓰지 않는다 — 다 버려지면 획을 만들지 않는다", async () => {
    await boot();
    const mixed = useWorkspace.getState().addWallStroke({
      points: [
        { x: 1, y: 1 },
        { x: Infinity, y: 0 },
        { x: BOARD_COORD_MAX + 1, y: 0 },
        { x: 2, y: 2 },
      ],
      color: "black",
      width: "thin",
    })!;
    expect(mixed.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    const none = useWorkspace.getState().addWallStroke({
      points: [{ x: NaN, y: 0 }],
      color: "black",
      width: "thin",
    });
    expect(none).toBeNull();
  });

  it("옮기기가 보드 좌표 한계를 넘기지 않는다", async () => {
    await boot();
    const s = useWorkspace.getState().addWallStroke({
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: "black",
      width: "thin",
    })!;
    useWorkspace.getState().moveWallStrokes([s.id], BOARD_COORD_MAX * 3, 0);
    const moved = useWorkspace.getState().wallStrokes[0];
    expect(moved.points.every((p) => p.x <= BOARD_COORD_MAX)).toBe(true);
    // 다시 읽어도 같다(읽기가 버리지 않는다).
    expect(readStroke(getActiveBoardDoc()!.doc, s.id)!.points).toEqual(moved.points);
  });

  it("보드당 획 수가 상한이면 새 획을 만들지 않는다", async () => {
    await boot();
    const full = Array.from({ length: MAX_WALL_STROKES }, (_, i) => ({
      id: `f${i}`,
      boardId: SYSTEM_BOARD_ID,
      points: [{ x: i, y: 0 }],
      color: "black" as const,
      width: "thin" as const,
      createdAt: i,
      updatedAt: i,
    }));
    useWorkspace.setState({ wallStrokes: full });
    const r = useWorkspace.getState().addWallStroke({
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      color: "black",
      width: "thin",
    });
    expect(r).toBeNull();
    expect(useWorkspace.getState().wallStrokes).toHaveLength(MAX_WALL_STROKES);
  });
});

describe("읽기 상한 — 문서", () => {
  it("points 문자열이 상한을 넘으면 파싱하지 않고 건너뛴다", () => {
    const doc = new Y.Doc();
    const m = new Y.Map<unknown>();
    strokesMap(doc).set("big", m);
    m.set("id", "big");
    m.set("boardId", "b");
    m.set("createdAt", 1);
    // 유효한 JSON이지만 상한을 넘는 길이.
    m.set("points", JSON.stringify(ramp(1)) + " ".repeat(MAX_STROKE_POINTS_CHARS));
    expect(readStrokes(doc)).toEqual([]);
  });

  it("획 수가 상한을 넘으면 그린 순서 앞에서부터 상한만큼만 읽는다", () => {
    const doc = new Y.Doc();
    const pts = JSON.stringify([{ x: 0, y: 0 }]);
    doc.transact(() => {
      for (let i = 0; i < MAX_WALL_STROKES + 20; i++) {
        const m = new Y.Map<unknown>();
        strokesMap(doc).set(`s${i}`, m);
        m.set("id", `s${i}`);
        m.set("boardId", "b");
        m.set("points", pts);
        m.set("createdAt", i);
      }
    });
    const read = readStrokes(doc);
    expect(read).toHaveLength(MAX_WALL_STROKES);
    expect(read[0].id).toBe("s0");
  });
});

describe("상한 — 포스트잇 overlay", () => {
  it("한 획의 점 수가 상한을 넘으면 읽을 때 상한까지만 받는다", () => {
    const json = JSON.stringify({ paths: [ramp(MAX_STROKE_POINTS + 100)] });
    expect(parseStrokes(json)[0].points).toHaveLength(MAX_STROKE_POINTS);
  });

  it("획 수가 상한을 넘으면 상한까지만 받는다", () => {
    const json = JSON.stringify({
      paths: Array.from({ length: MAX_OVERLAY_STROKES + 5 }, (_, i) => [{ x: i, y: 0 }]),
    });
    expect(parseStrokes(json)).toHaveLength(MAX_OVERLAY_STROKES);
  });

  it("문자열 길이가 상한을 넘으면 파싱하지 않는다", () => {
    const json = JSON.stringify({ paths: [ramp(2)] }) + " ".repeat(MAX_OVERLAY_CHARS);
    expect(parseStrokes(json)).toEqual([]);
  });

  it("쓸 때 점이 상한을 넘으면 솎아서 쓴다 — 쓴 것을 읽으면 같은 점 수", () => {
    const written = serializeStrokes([
      { points: ramp(MAX_STROKE_POINTS + 700), color: "black", width: "thin" },
    ]);
    const back = parseStrokes(written);
    expect(back[0].points.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    expect(back[0].points[back[0].points.length - 1].x).toBe(MAX_STROKE_POINTS + 699);
  });
});
