/**
 * wall-marker 리뷰 W6 — 포스트잇 획의 되돌리기는 "더한 획 id·지운 획(원본)"을 기록한다. overlay는
 * 문자열 하나라 before/after 전체를 기록하면 남이 그은 획까지 같이 돌아가 버린다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { parseStrokes, serializeStrokes, type HandwritingStroke } from "@/state/cardContent";

const pts = (...xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));
const st = (id: string | undefined, color: HandwritingStroke["color"], ...xy: [number, number][]): HandwritingStroke => ({
  ...(id ? { id } : {}),
  points: pts(...xy),
  color,
  width: "thin",
});

const overlay = () => useWorkspace.getState().cards.find((c) => c.id === "c1")?.overlay ?? "";
const ids = () => parseStrokes(overlay()).map((s) => s.id);

/** 원격 반영 — setOverlay(내 동작)를 거치지 않고 카드의 overlay만 바뀐다. */
function remoteSetsOverlay(json: string) {
  useWorkspace.setState((s) => ({
    cards: s.cards.map((c) => (c.id === "c1" ? { ...c, overlay: json } : c)),
  }));
}

beforeEach(() => {
  useWorkspace.setState({
    cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 240, content: "" }],
    wallStrokes: [],
    markerUndoStack: [],
    markerRedoStack: [],
    heldTool: null,
    currentBoardId: SYSTEM_BOARD_ID,
  });
});

afterEach(() => {
  useWorkspace.setState({ cards: [], markerUndoStack: [], markerRedoStack: [] });
});

describe("포스트잇 ⌘Z — 내 획만 돌린다", () => {
  it("상대가 더 그은 뒤에 내가 ⌘Z해도 상대 획은 남는다", () => {
    const mine = st("mine", "red", [0, 0], [10, 10]);
    useWorkspace.getState().setOverlay("c1", serializeStrokes([mine]));
    // 상대가 이어서 그은 획이 들어왔다.
    const theirs = st("theirs", "blue", [5, 5], [20, 20]);
    remoteSetsOverlay(serializeStrokes([mine, theirs]));

    useWorkspace.getState().markerUndo();

    expect(ids()).toEqual(["theirs"]);
  });

  it("다시하기(⌘⇧Z)도 그 획만 되살리고 그 사이 들어온 획은 건드리지 않는다", () => {
    const mine = st("mine", "red", [0, 0], [10, 10]);
    useWorkspace.getState().setOverlay("c1", serializeStrokes([mine]));
    useWorkspace.getState().markerUndo();
    expect(ids()).toEqual([]);

    const theirs = st("theirs", "blue", [5, 5], [20, 20]);
    remoteSetsOverlay(serializeStrokes([theirs]));
    useWorkspace.getState().markerRedo();

    expect(ids().sort()).toEqual(["mine", "theirs"]);
  });

  it("지운 획(원본)을 되살려도 그 사이 들어온 획은 남는다", () => {
    const a = st("a", "red", [0, 0], [10, 10]);
    const b = st("b", "green", [0, 20], [10, 30]);
    useWorkspace.getState().setOverlay("c1", serializeStrokes([a, b]));
    // 천으로 a를 지웠다(조각 없이 통째).
    useWorkspace.getState().setOverlay("c1", serializeStrokes([b]));
    // 상대가 c를 그었다.
    const c = st("c", "blue", [30, 30], [40, 40]);
    remoteSetsOverlay(serializeStrokes([b, c]));

    useWorkspace.getState().markerUndo(); // 지우기 되돌리기

    expect(ids().sort()).toEqual(["a", "b", "c"]);
    // 원본 색·굵기 그대로.
    expect(parseStrokes(overlay()).find((s) => s.id === "a")).toMatchObject({ color: "red", width: "thin" });
  });

  it("지우개 쪼개기(원본 → 조각 둘)를 되돌리면 조각만 빠지고 원본이 돌아온다", () => {
    const whole = st("whole", "red", [0, 0], [100, 0]);
    useWorkspace.getState().setOverlay("c1", serializeStrokes([whole]));
    const left = st("l", "red", [0, 0], [40, 0]);
    const right = st("r", "red", [60, 0], [100, 0]);
    useWorkspace.getState().setOverlay("c1", serializeStrokes([left, right]));
    expect(ids().sort()).toEqual(["l", "r"]);

    useWorkspace.getState().markerUndo();
    expect(ids()).toEqual(["whole"]);

    useWorkspace.getState().markerRedo();
    expect(ids().sort()).toEqual(["l", "r"]);
  });

  it("id가 없는 옛 획도 지웠다 되살리면 바이트가 같다(옛 형식 그대로)", () => {
    const legacy = JSON.stringify({ paths: [pts([0, 0], [10, 10]), pts([5, 5], [6, 6])] });
    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 240, content: "", overlay: legacy }],
    });
    // 첫 획만 남기고 두 번째를 지웠다.
    const only = JSON.stringify({ paths: [pts([0, 0], [10, 10])] });
    useWorkspace.getState().setOverlay("c1", only);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(1);

    useWorkspace.getState().markerUndo();

    expect(overlay()).toBe(legacy);
  });

  it("그 사이 포스트잇이 사라졌으면 기록은 건너뛴다", () => {
    useWorkspace.getState().setOverlay("c1", serializeStrokes([st("mine", "red", [0, 0], [1, 1])]));
    useWorkspace.setState({ cards: [] });
    expect(() => useWorkspace.getState().markerUndo()).not.toThrow();
    expect(useWorkspace.getState().markerUndoStack).toEqual([]);
  });

  it("획 구성이 안 바뀌는 쓰기(같은 획 목록)는 기록하지 않는다", () => {
    const mine = st("mine", "red", [0, 0], [10, 10]);
    useWorkspace.getState().setOverlay("c1", serializeStrokes([mine]));
    const before = useWorkspace.getState().markerUndoStack.length;
    // 같은 획을 공백만 다르게 다시 썼다.
    useWorkspace.getState().setOverlay("c1", ` ${serializeStrokes([mine])}`);
    expect(useWorkspace.getState().markerUndoStack).toHaveLength(before);
  });
});
