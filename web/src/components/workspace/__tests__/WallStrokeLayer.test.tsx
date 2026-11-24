import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render } from "@testing-library/react";
import * as Y from "yjs";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { useToasts } from "@/state/notifications";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { resetCollabStore } from "@/state/collab";
import { destroyBoardDocs, getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import { readStrokes, strokeToYMap, strokesMap } from "@/state/ydoc/model";
import { blockWallInput } from "@/state/marker/inputGate";

// wall-marker n4 — 벽 획 레이어. 실제 Canvas 포인터 이벤트 → 스토어 → Y.Doc → Dexie를 탄다.
// 포인터는 jsdom에서 PointerEvent 필드를 직접 실어 보낸다(n3 엔진 테스트와 같은 방식).

let originalStorage: PropertyDescriptor | undefined;
const originalSize = { w: 0, h: 0 };

beforeEach(async () => {
  originalSize.w = window.innerWidth;
  originalSize.h = window.innerHeight;
  // 태블릿 크기 — 휴대폰 판정(짧은 변 600 미만)에 걸리지 않게.
  setWindowSize(1024, 768);
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
    wallStrokes: [],
    selectedIds: [],
    editingId: null,
    heldTool: null,
    markerWidth: "thin",
    lastMarkerColor: "black",
    markerUndoStack: [],
    markerRedoStack: [],
    textPlacementArmed: false,
    viewport: { x: 0, y: 0, scale: 1 },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await destroyBoardDocs();
  await resetDB();
  resetCollabStore();
  useToasts.getState().clear();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    wallStrokes: [],
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
  setWindowSize(originalSize.w, originalSize.h);
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
}

async function mountCanvas() {
  const utils = render(
    <I18nProvider locale="ko">
      <Canvas />
    </I18nProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  const root = utils.container.querySelector<HTMLElement>('[data-canvas-root="true"]')!;
  expect(root).toBeTruthy();
  return { ...utils, root };
}

type PointerKind = "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel";

function pointer(
  target: Element,
  type: PointerKind,
  init: { pointerId?: number; clientX: number; clientY: number; pointerType?: string },
) {
  const ev = createEvent[type](target, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(ev, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(ev, "pointerType", { value: init.pointerType ?? "mouse" });
  fireEvent(target, ev);
}

/** 한 획을 긋는다 — 첫 점에서 누르고, 나머지를 지나, 마지막 점에서 뗀다. */
function drag(
  target: Element,
  pts: Array<[number, number]>,
  opts: { pointerId?: number; pointerType?: string } = {},
) {
  const [first, ...rest] = pts;
  pointer(target, "pointerDown", { clientX: first[0], clientY: first[1], ...opts });
  for (const [x, y] of rest) pointer(target, "pointerMove", { clientX: x, clientY: y, ...opts });
  const last = pts[pts.length - 1];
  pointer(target, "pointerUp", { clientX: last[0], clientY: last[1], ...opts });
}

const strokes = () => useWorkspace.getState().wallStrokes;

describe("빈 벽에 쓰기 (T3)", () => {
  it("파랑 마카를 들고 빈 벽을 끌면 파랑 획 1개가 보드 좌표로 남는다", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("blue"));

    drag(root, [
      [100, 80],
      [140, 90],
      [180, 80],
    ]);

    expect(strokes()).toHaveLength(1);
    const s = strokes()[0];
    expect(s.color).toBe("blue");
    expect(s.width).toBe("thin");
    expect(s.points[0]).toEqual({ x: 100, y: 80 });
    expect(s.points[s.points.length - 1]).toEqual({ x: 180, y: 80 });
    // 월드 변환 안, 카드·연결선 아래 레이어에 그려진다.
    const world = root.querySelector("[data-canvas-world]")!;
    const el = world.querySelector(`[data-wall-stroke="${s.id}"]`);
    expect(el).toBeTruthy();
    expect(el!.getAttribute("data-color")).toBe("blue");
  });

  it("실경로: 포인터 → 스토어 → Y.Doc까지 같은 획이 남는다 (새로고침 뒤에도)", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("red"));
    drag(root, [
      [10, 10],
      [60, 40],
    ]);
    const mine = strokes()[0];

    // 문서(유일한 원본)에 즉시.
    const inDoc = readStrokes(getActiveBoardDoc()!.doc);
    expect(inDoc.map((x) => x.id)).toEqual([mine.id]);
    expect(inDoc[0].points).toEqual(mine.points);
    expect(inDoc[0].color).toBe("red");

    // 새로고침: 화면 상태를 비우고 다시 불러온다.
    useWorkspace.setState({ wallStrokes: [] });
    await act(async () => {
      await useWorkspace.getState().loadFromStorage();
    });
    expect(strokes().map((x) => x.id)).toEqual([mine.id]);
  });

  it("점 하나(탭)도 점으로 남는다 — 마카를 든 채 두 번 누르면 점 두 개다", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("black"));
    drag(root, [[50, 50]]);
    drag(root, [[52, 50]]);
    expect(strokes()).toHaveLength(2);
    // 마카를 든 두 번 누르기는 포스트잇을 만들지 않는다.
    fireEvent.doubleClick(root, { clientX: 52, clientY: 50 });
    expect(useWorkspace.getState().cards).toHaveLength(0);
  });

  it("마카를 안 들었으면 마우스 끌기는 획이 아니다", async () => {
    const { root } = await mountCanvas();
    drag(root, [
      [10, 10],
      [80, 80],
    ]);
    expect(strokes()).toHaveLength(0);
  });
});

describe("줌과 팬 (T3·T5)", () => {
  it("줌 2배에서 그어도 저장 좌표는 줌 1배 기준과 같다", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("black"));

    // 줌 1배: 화면 (50,40)→(70,60) 이 곧 보드 좌표다.
    drag(root, [
      [50, 40],
      [70, 60],
    ]);
    const atOne = strokes()[0].points;

    // 줌 1.1배(상한)·팬 이동에서 같은 보드 자리를 가리키는 화면 좌표로 긋는다.
    act(() => useWorkspace.setState({ viewport: { x: 40, y: 20, scale: 1.1 } }));
    const sx = (bx: number) => bx * 1.1 + 40;
    const sy = (by: number) => by * 1.1 + 20;
    drag(root, [
      [sx(50), sy(40)],
      [sx(70), sy(60)],
    ]);
    const atZoom = strokes()[1].points;

    expect(atZoom).toHaveLength(atOne.length);
    atZoom.forEach((p, i) => {
      expect(p.x).toBeCloseTo(atOne[i].x, 0);
      expect(p.y).toBeCloseTo(atOne[i].y, 0);
    });
  });

  it("팬·줌을 바꿔도 저장된 획은 그대로이고 같은 월드 변환 안에 있다", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("green"));
    drag(root, [
      [100, 100],
      [200, 150],
    ]);
    const before = JSON.stringify(strokes());

    act(() => useWorkspace.setState({ viewport: { x: -300, y: 120, scale: 0.6 } }));
    expect(JSON.stringify(strokes())).toBe(before);
    const world = root.querySelector<HTMLElement>("[data-canvas-world]")!;
    expect(world.style.transform).toContain("scale(0.6)");
    expect(world.querySelector("[data-wall-stroke-layer]")).toBeTruthy();
  });
});

describe("포스트잇을 옮겨도 벽 획은 제자리 (T5)", () => {
  it("벽에 그린 동그라미는 포스트잇 이동 전후 저장값이 같다", async () => {
    const { root } = await mountCanvas();
    let noteId = "";
    act(() => {
      noteId = useWorkspace.getState().addCardAt("text", 300, 300);
      useWorkspace.getState().setEditing(null);
    });
    act(() => useWorkspace.getState().holdMarker("red"));
    drag(root, [
      [280, 280],
      [420, 280],
      [420, 420],
      [280, 420],
      [280, 280],
    ]);
    act(() => useWorkspace.getState().releaseTool());
    const before = JSON.stringify(strokes());
    expect(strokes()).toHaveLength(1);

    act(() => useWorkspace.getState().moveCard(noteId, 600, 300));

    const note = useWorkspace.getState().cards.find((c) => c.id === noteId)!;
    expect(note.x).toBe(600);
    expect(JSON.stringify(strokes())).toBe(before);
  });
});

describe("시작점이 주인 (D4=A · D12=A)", () => {
  it("메모판 위에서 시작한 획은 벽 획이 된다", async () => {
    const { root } = await mountCanvas();
    let frameId = "";
    act(() => {
      frameId = useWorkspace.getState().addFrameAt(100, 100);
    });
    act(() => useWorkspace.getState().holdMarker("black"));
    const frameEl = root.querySelector(`[data-card-id="${frameId}"]`)!;
    expect(frameEl).toBeTruthy();

    drag(frameEl, [
      [150, 150],
      [200, 180],
    ]);
    expect(strokes()).toHaveLength(1);
  });

  it("포스트잇 위에서 시작한 획은 벽 획이 아니다 (포스트잇 획은 n5 몫)", async () => {
    const { root } = await mountCanvas();
    let noteId = "";
    act(() => {
      noteId = useWorkspace.getState().addCardAt("text", 100, 100);
      useWorkspace.getState().setEditing(null);
    });
    act(() => useWorkspace.getState().holdMarker("black"));
    const noteEl = root.querySelector(`[data-card-id="${noteId}"]`)!;

    drag(noteEl, [
      [150, 150],
      [200, 180],
    ]);
    expect(strokes()).toHaveLength(0);
  });

  it("그리는 도중 포스트잇 위를 지나가도 같은 벽 획으로 이어진다", async () => {
    const { root } = await mountCanvas();
    let noteId = "";
    act(() => {
      noteId = useWorkspace.getState().addCardAt("text", 100, 100);
      useWorkspace.getState().setEditing(null);
    });
    act(() => useWorkspace.getState().holdMarker("black"));
    const noteEl = root.querySelector(`[data-card-id="${noteId}"]`)!;

    pointer(root, "pointerDown", { clientX: 20, clientY: 20 });
    pointer(noteEl, "pointerMove", { clientX: 150, clientY: 150 }); // 포스트잇 위
    pointer(root, "pointerMove", { clientX: 600, clientY: 400 });
    pointer(root, "pointerUp", { clientX: 600, clientY: 400 });

    expect(strokes()).toHaveLength(1);
    expect(strokes()[0].points).toHaveLength(3);
  });

  it("캔버스 UI(줌 막대) 위에서 누른 건 획이 아니다", async () => {
    const { root, getAllByRole } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("black"));
    const button = getAllByRole("button")[0];
    drag(button, [
      [5, 5],
      [30, 30],
    ]);
    expect(strokes()).toHaveLength(0);
    expect(root).toBeTruthy();
  });
});

describe("천으로 닦기 (T8)", () => {
  it("천으로 문지른 자리만 지워지고, 지운 획은 ⌘Z로 돌아온다", async () => {
    const { root } = await mountCanvas();
    let line!: { id: string };
    let far!: { id: string };
    act(() => {
      line = useWorkspace.getState().addWallStroke({
        points: [
          { x: 0, y: 100 },
          { x: 200, y: 100 },
        ],
        color: "black",
        width: "thin",
      })!;
      far = useWorkspace.getState().addWallStroke({
        points: [
          { x: 0, y: 400 },
          { x: 200, y: 400 },
        ],
        color: "red",
        width: "thin",
      })!;
    });
    act(() => useWorkspace.getState().holdCloth());

    drag(root, [
      [90, 100],
      [110, 100],
    ]);

    const ids = strokes().map((s) => s.id);
    expect(ids).not.toContain(line.id);
    expect(ids).toContain(far.id);
    // 가운데가 잘려 양쪽 두 조각이 남는다.
    const pieces = strokes().filter((s) => s.id !== far.id);
    expect(pieces).toHaveLength(2);
    pieces.forEach((p) => expect(p.color).toBe("black"));
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(1);

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(strokes().map((s) => s.id).sort()).toEqual([line.id, far.id].sort());
  });

  it("아무것도 안 닿은 문지르기는 아무 일도 없고 기록도 안 쌓인다", async () => {
    const { root } = await mountCanvas();
    act(() => {
      useWorkspace.getState().addWallStroke({
        points: [
          { x: 0, y: 100 },
          { x: 50, y: 100 },
        ],
        color: "black",
        width: "thin",
      });
    });
    act(() => useWorkspace.getState().holdCloth());
    const before = JSON.stringify(strokes());
    drag(root, [
      [300, 300],
      [320, 320],
    ]);
    expect(JSON.stringify(strokes())).toBe(before);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(0);
  });
});

describe("되돌리기 기록 (D9=A)", () => {
  it("그은 획은 ⌘Z로 사라지고 ⇧⌘Z로 돌아온다", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("blue"));
    drag(root, [
      [10, 10],
      [90, 40],
    ]);
    const id = strokes()[0].id;

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(strokes()).toHaveLength(0);
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(strokes().map((s) => s.id)).toEqual([id]);
  });
});

describe("공유 보드 (T11)", () => {
  it("두 문서를 이어 각자 한 획씩 그으면 양쪽에 둘 다 보이고, ⌘Z는 자기 획만 지운다", async () => {
    const { root } = await mountCanvas();
    const mineDoc = getActiveBoardDoc()!.doc;
    // 다른 기기의 문서 — 같은 상태에서 시작해 서로 주고받는다.
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(mineDoc));

    // 내 기기: 포인터로 한 획.
    act(() => useWorkspace.getState().holdMarker("blue"));
    drag(root, [
      [10, 10],
      [80, 30],
    ]);
    const mine = strokes()[0];

    // 상대 기기: 같은 순간에 자기 문서에 한 획을 쓴다.
    peer.transact(() => {
      strokesMap(peer).set(
        "peer-1",
        strokeToYMap({
          id: "peer-1",
          boardId: SYSTEM_BOARD_ID,
          points: [
            { x: 200, y: 200 },
            { x: 260, y: 240 },
          ],
          color: "red",
          width: "mid",
          createdAt: Date.now() + 5,
          updatedAt: Date.now() + 5,
        }),
      );
    });

    // 서로의 변경을 주고받는다(원격 origin).
    act(() => {
      Y.applyUpdate(mineDoc, Y.encodeStateAsUpdate(peer), { kind: "remote" });
    });
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(mineDoc));

    expect(strokes().map((s) => s.id).sort()).toEqual([mine.id, "peer-1"].sort());
    expect(readStrokes(peer)).toHaveLength(2);
    // 상대 획은 내 기록에 안 들어온다.
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(1);

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(strokes().map((s) => s.id)).toEqual(["peer-1"]);

    // 내 되돌리기가 문서에 나가 상대 화면에서도 내 획만 사라진다.
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(mineDoc));
    expect(readStrokes(peer).map((s) => s.id)).toEqual(["peer-1"]);
  });
});

describe("두 손가락 (T12)", () => {
  it("그리는 중 두 번째 손가락이 닿으면 획은 남지 않고 화면이 확대된다. 손을 떼면 다시 그려진다", async () => {
    const { root } = await mountCanvas();
    act(() => {
      useWorkspace.setState({ viewport: { x: 0, y: 0, scale: 0.6 } });
      useWorkspace.getState().holdMarker("black");
    });

    pointer(root, "pointerDown", { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
    pointer(root, "pointerMove", { pointerId: 1, pointerType: "touch", clientX: 120, clientY: 110 });
    pointer(root, "pointerDown", { pointerId: 2, pointerType: "touch", clientX: 300, clientY: 100 });
    // 벌린다.
    pointer(root, "pointerMove", { pointerId: 2, pointerType: "touch", clientX: 340, clientY: 100 });
    pointer(root, "pointerMove", { pointerId: 1, pointerType: "touch", clientX: 80, clientY: 100 });
    pointer(root, "pointerUp", { pointerId: 2, pointerType: "touch", clientX: 340, clientY: 100 });
    pointer(root, "pointerUp", { pointerId: 1, pointerType: "touch", clientX: 80, clientY: 100 });

    expect(strokes()).toHaveLength(0);
    expect(useWorkspace.getState().viewport.scale).toBeGreaterThan(0.6);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(0);

    // 손을 떼고 다시 그으면 정상으로 그려진다.
    drag(
      root,
      [
        [50, 50],
        [90, 70],
      ],
      { pointerId: 3, pointerType: "touch" },
    );
    expect(strokes()).toHaveLength(1);
  });

  it("든 동안엔 터치 동작을 브라우저에 넘기지 않는다", async () => {
    const { root } = await mountCanvas();
    expect(root.style.touchAction).toBe("manipulation");
    act(() => useWorkspace.getState().holdMarker("black"));
    expect(root.style.touchAction).toBe("none");
  });
});

describe("태블릿 펜 (D5=A)", () => {
  it("아무것도 안 들어도 펜이 닿으면 마지막에 쓴 마카로 그린다", async () => {
    const { root } = await mountCanvas();
    act(() => {
      useWorkspace.getState().holdMarker("green");
      useWorkspace.getState().releaseTool();
    });
    expect(useWorkspace.getState().heldTool).toBeNull();

    drag(
      root,
      [
        [30, 30],
        [90, 60],
      ],
      { pointerType: "pen" },
    );
    expect(strokes()).toHaveLength(1);
    expect(strokes()[0].color).toBe("green");
    // 펜으로 방금 찍은 두 번 누르기는 포스트잇을 만들지 않는다.
    fireEvent.doubleClick(root, { clientX: 90, clientY: 60 });
    expect(useWorkspace.getState().cards).toHaveLength(0);
  });

  it("손가락은 안 들었으면 그리지 않는다", async () => {
    const { root } = await mountCanvas();
    drag(
      root,
      [
        [30, 30],
        [90, 60],
      ],
      { pointerType: "touch" },
    );
    expect(strokes()).toHaveLength(0);
  });
});

describe("보드 전환 중·첫 벽 공유 이동 중 (W5)", () => {
  it("보드 전환 중에는 그어도 획이 남지 않는다", async () => {
    const { root } = await mountCanvas();
    act(() => {
      useWorkspace.getState().holdMarker("red");
      useWorkspace.setState({ boardTransitioning: true });
    });
    drag(root, [
      [10, 10],
      [80, 50],
    ]);
    expect(strokes()).toHaveLength(0);
    expect(readStrokes(getActiveBoardDoc()!.doc)).toHaveLength(0);

    act(() => useWorkspace.setState({ boardTransitioning: false }));
    drag(root, [
      [10, 10],
      [80, 50],
    ]);
    expect(strokes()).toHaveLength(1);
  });

  it("첫 벽 공유가 내용을 옮기는 동안(입력 차단)에는 그어도 획이 남지 않는다", async () => {
    const { root } = await mountCanvas();
    act(() => useWorkspace.getState().holdMarker("red"));
    const release = blockWallInput();
    drag(root, [
      [10, 10],
      [80, 50],
    ]);
    expect(strokes()).toHaveLength(0);
    release();
    drag(root, [
      [10, 10],
      [80, 50],
    ]);
    expect(strokes()).toHaveLength(1);
  });
});

describe("휴대폰 (T14)", () => {
  it("이미 있는 획은 보이고, 입력은 받지 않는다", async () => {
    const { root } = await mountCanvas();
    let existing = "";
    act(() => {
      existing = useWorkspace.getState().addWallStroke({
        points: [
          { x: 5, y: 5 },
          { x: 50, y: 50 },
        ],
        color: "red",
        width: "mid",
      })!.id;
    });
    // 휴대폰 크기 — 짧은 변 390. 들 수 없으므로 상태를 직접 넣어 입력 쪽만 본다.
    setWindowSize(390, 800);
    act(() => useWorkspace.setState({ heldTool: { kind: "marker", color: "black" } }));

    expect(root.querySelector(`[data-wall-stroke="${existing}"]`)).toBeTruthy();
    drag(root, [
      [10, 10],
      [90, 90],
    ]);
    drag(
      root,
      [
        [10, 10],
        [90, 90],
      ],
      { pointerType: "pen" },
    );
    expect(strokes().map((s) => s.id)).toEqual([existing]);
  });
});
