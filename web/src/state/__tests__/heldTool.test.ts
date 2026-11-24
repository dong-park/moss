/**
 * wall-marker n2 — 손에 든 도구(heldTool)와 마카 되돌리기 기록.
 * 벽 획·포스트잇 획을 실제 스토어 액션(문서·미러까지 닿는 경로)으로 만들어 돌린다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { destroyBoardDocs } from "@/state/ydoc/activeDoc";
import { flushAll } from "@/state/cardPersist";
import { useToasts } from "@/state/notifications";
import { drawingToolFor, isPhoneSize, isPhoneViewport } from "@/state/marker/heldTool";

let originalStorage: PropertyDescriptor | undefined;
const realSize = { w: window.innerWidth, h: window.innerHeight };

function setWindowSize(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: h, configurable: true, writable: true });
}

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
  setWindowSize(1280, 800);
});

afterEach(async () => {
  setWindowSize(realSize.w, realSize.h);
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
    heldTool: null,
    markerUndoStack: [],
    markerRedoStack: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    lastNonSystemBoardId: null,
    viewportByBoard: {},
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
const ov = (n: number) => JSON.stringify({ paths: [[{ x: n, y: n }]] });

describe("손에 든 도구 — 상태 전이", () => {
  it("처음엔 아무것도 안 들었고 마지막 마카 색은 검정이다", () => {
    const s = useWorkspace.getState();
    expect(s.heldTool).toBeNull();
    expect(s.lastMarkerColor).toBe("black");
    expect(s.markerWidth).toBe("thin");
  });

  it("마카를 집으면 그 색이 들리고 열린 글 편집은 닫힌다", () => {
    useWorkspace.setState({ editingId: "x" });
    useWorkspace.getState().holdMarker("blue");
    const s = useWorkspace.getState();
    expect(s.heldTool).toEqual({ kind: "marker", color: "blue" });
    expect(s.editingId).toBeNull();
    expect(s.lastMarkerColor).toBe("blue");
  });

  it("들고 있는 것을 다른 마카·천으로 바꿀 수 있고, 둘을 동시에 들지는 않는다", () => {
    const s = useWorkspace.getState();
    s.holdMarker("blue");
    useWorkspace.getState().holdMarker("red");
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "red" });
    useWorkspace.getState().holdCloth();
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "cloth" });
    useWorkspace.getState().holdMarker("green");
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "green" });
  });

  it("내려놓으면 아무것도 안 든 채가 되고, 마지막 마카 색은 남는다", () => {
    useWorkspace.getState().holdMarker("red");
    useWorkspace.getState().releaseTool();
    expect(useWorkspace.getState().heldTool).toBeNull();
    expect(useWorkspace.getState().lastMarkerColor).toBe("red");
  });

  it("글 편집을 시작하면 든 마카를 내려놓는다 — 마카를 든 채 글 편집 상태를 만들지 않는다", () => {
    useWorkspace.getState().holdMarker("blue");
    useWorkspace.getState().setEditing("card-1");
    const s = useWorkspace.getState();
    expect(s.editingId).toBe("card-1");
    expect(s.heldTool).toBeNull();
  });

  it("글 편집을 끝내는 것(setEditing(null))은 든 도구를 건드리지 않는다", () => {
    useWorkspace.getState().holdCloth();
    useWorkspace.getState().setEditing(null);
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "cloth" });
  });

  it("휴대폰 크기(짧은 변 600 미만)에서는 마카도 천도 들 수 없다", () => {
    setWindowSize(390, 844);
    expect(isPhoneViewport()).toBe(true);
    useWorkspace.getState().holdMarker("blue");
    expect(useWorkspace.getState().heldTool).toBeNull();
    useWorkspace.getState().holdCloth();
    expect(useWorkspace.getState().heldTool).toBeNull();
  });

  it("iPad mini 세로(744×1133)는 태블릿이라 들 수 있다 (D10)", () => {
    setWindowSize(744, 1133);
    expect(isPhoneViewport()).toBe(false);
    useWorkspace.getState().holdMarker("black");
    expect(useWorkspace.getState().heldTool).toEqual({ kind: "marker", color: "black" });
  });

  it("휴대폰 판정은 짧은 변 기준이다 — 가로로 눕힌 휴대폰도 휴대폰", () => {
    expect(isPhoneSize(844, 390)).toBe(true);
    expect(isPhoneSize(600, 900)).toBe(false);
    expect(isPhoneSize(599, 900)).toBe(true);
  });

  it("굵기는 이름으로 고르고 모르는 이름은 가는 선으로 읽는다", () => {
    useWorkspace.getState().setMarkerWidth("thick");
    expect(useWorkspace.getState().markerWidth).toBe("thick");
    useWorkspace.getState().setMarkerWidth("huge" as never);
    expect(useWorkspace.getState().markerWidth).toBe("thin");
  });

  it("텍스트 배치 모드를 켜면 든 마카를 내려놓는다", () => {
    useWorkspace.getState().holdMarker("blue");
    useWorkspace.getState().armTextPlacement();
    expect(useWorkspace.getState().heldTool).toBeNull();
  });
});

describe("drawingToolFor — 입력 장치별 그릴 도구 (D5=A)", () => {
  it("든 것이 있으면 입력 장치와 상관없이 그것이 그린다", () => {
    const blue = { kind: "marker", color: "blue" } as const;
    expect(drawingToolFor(blue, "mouse", "red")).toEqual(blue);
    expect(drawingToolFor(blue, "touch", "red")).toEqual(blue);
    expect(drawingToolFor({ kind: "cloth" }, "pen", "red")).toEqual({ kind: "cloth" });
  });

  it("아무것도 안 들었어도 태블릿 펜이 닿으면 마지막에 쓴 마카로 그린다", () => {
    expect(drawingToolFor(null, "pen", "green")).toEqual({ kind: "marker", color: "green" });
  });

  it("아무것도 안 들었으면 손가락·마우스는 그리지 않는다", () => {
    expect(drawingToolFor(null, "touch", "green")).toBeNull();
    expect(drawingToolFor(null, "mouse", "green")).toBeNull();
  });
});

describe("마카 되돌리기 기록 — 벽 획과 포스트잇 획이 한 줄 (D9=A, T10)", () => {
  it("실경로: 벽 동그라미 → 포스트잇 밑줄 → 벽 화살표를 ⌘Z 세 번이면 역순으로 사라지고 ⇧⌘Z 한 번이면 첫 획이 돌아온다", async () => {
    await boot();
    const noteId = useWorkspace.getState().addCardAt("text", 100, 100);
    useWorkspace.getState().holdMarker("black");

    const circle = useWorkspace.getState().addWallStroke({ points: line(0, 0, 30, 30), color: "black", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [circle] });

    useWorkspace.getState().setOverlay(noteId, ov(1)); // 포스트잇 밑줄 — 기록에 자동으로 쌓인다

    const arrow = useWorkspace.getState().addWallStroke({ points: line(50, 0, 90, 40), color: "red", width: "mid" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [arrow] });

    const wallIds = () => useWorkspace.getState().wallStrokes.map((x) => x.id);
    const overlay = () => useWorkspace.getState().cards.find((c) => c.id === noteId)?.overlay;
    expect(wallIds()).toEqual([circle.id, arrow.id]);

    useWorkspace.getState().markerUndo(); // 화살표
    expect(wallIds()).toEqual([circle.id]);
    expect(overlay()).toBe(ov(1));

    useWorkspace.getState().markerUndo(); // 밑줄
    expect(overlay() ?? "").toBe("");
    expect(wallIds()).toEqual([circle.id]);

    useWorkspace.getState().markerUndo(); // 동그라미
    expect(wallIds()).toEqual([]);

    useWorkspace.getState().markerRedo(); // 동그라미가 다시 나타난다
    expect(wallIds()).toEqual([circle.id]);
    expect(useWorkspace.getState().wallStrokes[0]).toMatchObject({
      points: circle.points,
      color: "black",
      width: "thin",
    });
    expect(overlay() ?? "").toBe("");
  });

  it("지우개 동작(지운 획 → 남은 조각)도 한 번에 되돌아간다", async () => {
    await boot();
    const full = useWorkspace.getState().addWallStroke({ points: line(0, 0, 100, 0), color: "blue", width: "thick" })!;
    const [left, right] = useWorkspace.getState().replaceWallStrokes(
      [full.id],
      [
        { points: line(0, 0, 40, 0), color: "blue", width: "thick" },
        { points: line(60, 0, 100, 0), color: "blue", width: "thick" },
      ],
    );
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [full], after: [left, right] });
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([left.id, right.id]);

    useWorkspace.getState().markerUndo();
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([full.id]);
    // 되돌린 획은 원래 id·색·굵기 그대로다.
    expect(useWorkspace.getState().wallStrokes[0]).toMatchObject({ id: full.id, color: "blue", width: "thick" });

    useWorkspace.getState().markerRedo();
    expect(useWorkspace.getState().wallStrokes.map((x) => x.id)).toEqual([left.id, right.id]);
  });

  it("새 동작을 하면 다시하기 기록은 무효가 된다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "black", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [a] });
    useWorkspace.getState().markerUndo();
    expect(useWorkspace.getState().markerRedoStack).toHaveLength(1);
    const b = useWorkspace.getState().addWallStroke({ points: line(9, 9, 12, 12), color: "black", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [b] });
    expect(useWorkspace.getState().markerRedoStack).toHaveLength(0);
  });

  it("다른 사람이 이미 지운 획의 기록을 되돌려도 깨지지 않는다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "black", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [a] });
    useWorkspace.getState().removeWallStrokes([a.id]); // 남이 지웠다
    expect(() => useWorkspace.getState().markerUndo()).not.toThrow();
    expect(useWorkspace.getState().wallStrokes).toEqual([]);
  });

  it("사라진 포스트잇의 기록은 건너뛰고 그 아래 기록을 되돌린다", async () => {
    await boot();
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "black", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [a] });
    useWorkspace.getState().recordMarkerEdit({
      kind: "sticky",
      noteId: "gone",
      added: [{ id: "x", points: [{ x: 1, y: 1 }], color: "black", width: "thin" }],
      removed: [],
    });

    useWorkspace.getState().markerUndo();
    expect(useWorkspace.getState().wallStrokes).toEqual([]);
    expect(useWorkspace.getState().markerUndoStack).toEqual([]);
  });

  it("기록이 비었으면 되돌리기·다시하기는 아무 일도 없다", () => {
    expect(() => {
      useWorkspace.getState().markerUndo();
      useWorkspace.getState().markerRedo();
    }).not.toThrow();
  });

  it("같은 값으로 setOverlay하면 기록이 쌓이지 않는다", () => {
    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 240, content: "", overlay: ov(1) }],
    });
    useWorkspace.getState().setOverlay("c1", ov(1));
    expect(useWorkspace.getState().markerUndoStack).toEqual([]);
  });

  it("setOverlay는 overlay만 바꾸고 content는 건드리지 않는다", () => {
    useWorkspace.setState({
      cards: [{ id: "o1", kind: "text", x: 0, y: 0, width: 240, content: "메모 본문" }],
    });
    useWorkspace.getState().setOverlay("o1", ov(5));
    const c = useWorkspace.getState().cards.find((x) => x.id === "o1");
    expect(c?.overlay).toBe(ov(5));
    expect(c?.content).toBe("메모 본문");
    // 기록은 "더한 획"(옛 형식 획은 내용에서 만든 id가 붙는다)이다 — 전후 문자열 전체가 아니다.
    const stack = useWorkspace.getState().markerUndoStack;
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({
      kind: "sticky",
      noteId: "o1",
      removed: [],
      added: [{ points: [{ x: 5, y: 5 }], color: "black", width: "thin" }],
    });
  });

  it("보드를 떠나면 기록이 비워진다 (D9=A: 보드를 떠날 때까지 남는다)", async () => {
    await boot();
    const otherId = await useWorkspace.getState().createBoard("다른 벽"); // 새 보드로 전환된다
    expect(useWorkspace.getState().currentBoardId).toBe(otherId);
    const a = useWorkspace.getState().addWallStroke({ points: line(0, 0, 5, 5), color: "black", width: "thin" })!;
    useWorkspace.getState().recordMarkerEdit({ kind: "wall", before: [], after: [a] });
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(1);

    await useWorkspace.getState().setCurrentBoard(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().markerUndoStack).toEqual([]);
    expect(useWorkspace.getState().markerRedoStack).toEqual([]);
  });
});
