/**
 * wall-marker n1 (D1=A) — 벽 획 한 개 = Y.Map 한 항목. 왕복·동시 그리기·지운 쪽이 이김.
 */
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import type { WallStroke } from "@/state/db/schema";
import {
  MAX_STROKE_POINTS,
  applyStrokeChanges,
  deleteStroke,
  putStroke,
  readStroke,
  readStrokes,
  strokesMap,
  strokeToYMap,
  yMapToStroke,
} from "@/state/ydoc/model";

function stroke(overrides: Partial<WallStroke> = {}): WallStroke {
  return {
    id: "s-1",
    boardId: "b-1",
    points: [
      { x: 1.5, y: -2 },
      { x: 30, y: 40.25 },
    ],
    color: "red",
    width: "mid",
    createdAt: 1000,
    updatedAt: 1001,
    ...overrides,
  };
}

/** 두 문서를 양방향으로 맞춘다. */
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

describe("벽 획 Y.Map 왕복", () => {
  it("모든 필드가 왕복한다", () => {
    const doc = new Y.Doc();
    const s = stroke();
    putStroke(doc, s);
    expect(readStroke(doc, "s-1")).toEqual(s);
    expect(readStrokes(doc)).toEqual([s]);
  });

  it("점이 하나도 없거나 id·보드가 없는 항목은 읽기에서 건너뛴다", () => {
    const doc = new Y.Doc();
    const good = strokeToYMap(stroke({ id: "good" }));
    const noPoints = strokeToYMap(stroke({ id: "empty", points: [] }));
    const bad = new Y.Map<unknown>();
    bad.set("points", "[]");
    strokesMap(doc).set("good", good);
    strokesMap(doc).set("empty", noPoints);
    strokesMap(doc).set("bad", bad);
    expect(readStrokes(doc).map((x) => x.id)).toEqual(["good"]);
  });

  it("원격이 넣은 낯선 색·굵기 이름·깨진 점은 획을 버리지 않고 안전하게 읽는다", () => {
    const doc = new Y.Doc();
    const m = strokeToYMap(stroke());
    strokesMap(doc).set("s-1", m);
    m.set("color", "ultraviolet");
    m.set("width", "gigantic");
    m.set("points", JSON.stringify([{ x: 1, y: 2 }, { x: "no", y: 3 }, null, { x: 5, y: 6 }]));
    const read = yMapToStroke(m)!;
    expect(read.color).toBe("black");
    expect(read.width).toBe("thin");
    expect(read.points).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 6 },
    ]);
  });

  it("한 획의 점 수가 상한을 넘으면 상한에서 자른다", () => {
    const doc = new Y.Doc();
    const many = Array.from({ length: MAX_STROKE_POINTS + 50 }, (_, i) => ({ x: i, y: i }));
    putStroke(doc, stroke({ points: many }));
    expect(readStroke(doc, "s-1")!.points).toHaveLength(MAX_STROKE_POINTS);
  });

  it("그린 순서(createdAt, 같으면 id)로 정렬해 읽는다", () => {
    const doc = new Y.Doc();
    putStroke(doc, stroke({ id: "b", createdAt: 5 }));
    putStroke(doc, stroke({ id: "a", createdAt: 5 }));
    putStroke(doc, stroke({ id: "c", createdAt: 1 }));
    expect(readStrokes(doc).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("공유 보드 — 동시에 그어도 둘 다 남고, 지운 쪽이 이긴다 (T11)", () => {
  it("두 기기가 동시에 그은 획이 둘 다 남는다", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    putStroke(a, stroke({ id: "from-a" }));
    putStroke(b, stroke({ id: "from-b" }));
    sync(a, b);
    expect(readStrokes(a).map((x) => x.id).sort()).toEqual(["from-a", "from-b"]);
    expect(readStrokes(b).map((x) => x.id).sort()).toEqual(["from-a", "from-b"]);
  });

  it("내가 옮기는 동안 상대가 지우면 지운 쪽이 이긴다", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    putStroke(a, stroke());
    sync(a, b);
    // a는 옮기고 b는 지운다 — 동시에.
    applyStrokeChanges(a, {
      update: [stroke({ points: [{ x: 100, y: 100 }], updatedAt: 2000 })],
    });
    deleteStroke(b, "s-1");
    sync(a, b);
    expect(readStroke(a, "s-1")).toBeUndefined();
    expect(readStroke(b, "s-1")).toBeUndefined();
  });

  it("이미 지워진 획은 update(옮기기)가 되살리지 않는다", () => {
    const doc = new Y.Doc();
    putStroke(doc, stroke());
    deleteStroke(doc, "s-1");
    applyStrokeChanges(doc, { update: [stroke({ updatedAt: 3000 })] });
    expect(readStrokes(doc)).toEqual([]);
  });

  it("replace(원본 삭제 + 조각 추가)는 한 번의 문서 갱신으로 나간다", () => {
    const doc = new Y.Doc();
    putStroke(doc, stroke({ id: "whole" }));
    let updates = 0;
    doc.on("update", () => updates++);
    applyStrokeChanges(doc, {
      remove: ["whole"],
      put: [stroke({ id: "left", points: [{ x: 0, y: 0 }] }), stroke({ id: "right", points: [{ x: 9, y: 9 }] })],
    });
    expect(updates).toBe(1);
    expect(readStrokes(doc).map((x) => x.id).sort()).toEqual(["left", "right"]);
  });

  it("같은 값을 다시 쓰면 문서가 불어나지 않는다", () => {
    const doc = new Y.Doc();
    putStroke(doc, stroke());
    const before = Y.encodeStateAsUpdate(doc).byteLength;
    for (let i = 0; i < 20; i++) putStroke(doc, stroke());
    expect(Y.encodeStateAsUpdate(doc).byteLength).toBe(before);
  });
});
