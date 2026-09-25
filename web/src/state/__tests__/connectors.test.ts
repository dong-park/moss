import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_BOARD_ID,
  useWorkspace,
  type Card,
} from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB, type Connection, type Note } from "@/state/db/schema";
import { buildJsonCanvas } from "@/state/export/jsonCanvasExport";

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
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    selectedConnectionId: null,
    connections: [],
    editingId: null,
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { x: 0, y: 0, scale: 1 },
  });
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  }
});

function card(id: string, x = 0, y = 0): Card {
  return { id, kind: "text", x, y, width: 240, height: 240, content: "" };
}

function noteOf(id: string): Note {
  const now = Date.now();
  return {
    id,
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: now,
    updatedAt: now,
    lastVisitedAt: now,
  };
}

describe("FEAT-connectors · store", () => {
  it("connectCards: 저장하고 변을 기록한다 (AC-2)", async () => {
    await useStorage.getState().init();
    useWorkspace.setState({ cards: [card("a"), card("b", 600, 0)] });

    const id = useWorkspace.getState().connectCards("a", "right", "b", "left");
    expect(id).not.toBeNull();
    const conn = useWorkspace.getState().connections[0];
    expect(conn).toMatchObject({
      sourceNoteId: "a",
      targetNoteId: "b",
      source: "manual",
      status: "active",
      sourceSide: "right",
      targetSide: "left",
    });
    const saved = await vi.waitFor(async () => {
      const list = await useStorage.getState().loadConnections(["a"]);
      expect(list).toHaveLength(1);
      return list;
    });
    expect(saved[0].sourceSide).toBe("right");
  });

  it("connectCards: 같은 방향 중복은 새 행 없이 기존 선 선택 (AC-8)", () => {
    useWorkspace.setState({ cards: [card("a"), card("b", 600, 0)] });
    const first = useWorkspace.getState().connectCards("a", "right", "b", "left");
    const again = useWorkspace.getState().connectCards("a", "right", "b", "left");
    expect(again).toBe(first);
    expect(useWorkspace.getState().connections).toHaveLength(1);
    expect(useWorkspace.getState().selectedConnectionId).toBe(first);
  });

  it("connectCards: 자기 자신은 연결하지 않는다", () => {
    useWorkspace.setState({ cards: [card("a")] });
    expect(useWorkspace.getState().connectCards("a", "right", "a", "left")).toBeNull();
    expect(useWorkspace.getState().connections).toHaveLength(0);
  });

  it("connectToNewMemo: 놓은 자리에 새 메모를 만들고 마주보는 변으로 잇는다 (AC-3)", () => {
    useWorkspace.setState({ cards: [card("a", 0, 0)] });
    const newId = useWorkspace.getState().connectToNewMemo("a", "right", 600, 120);

    const created = useWorkspace.getState().cards.find((c) => c.id === newId);
    expect(created).toBeDefined();
    expect(created!.kind).toBe("text");
    // 카드 중심이 드롭 지점: x = 600 - 240/2.
    expect(created!.x).toBe(480);
    const conn = useWorkspace.getState().connections[0];
    expect(conn).toMatchObject({
      sourceNoteId: "a",
      targetNoteId: newId,
      sourceSide: "right",
      targetSide: "left",
    });
    // 새 메모 제목 편집 진입 + 카드 선택 유지.
    expect(useWorkspace.getState().editingId).toBe(newId);
    expect(useWorkspace.getState().selectedIds).toEqual([newId]);
  });

  it("removeConnection: 선과 선택을 지운다 (AC-5)", async () => {
    await useStorage.getState().init();
    useWorkspace.setState({ cards: [card("a"), card("b", 600, 0)] });
    const id = useWorkspace.getState().connectCards("a", "right", "b", "left")!;
    useWorkspace.getState().removeConnection(id);
    expect(useWorkspace.getState().connections).toHaveLength(0);
    expect(useWorkspace.getState().selectedConnectionId).toBeNull();
    expect(await useStorage.getState().loadConnections(["a"])).toHaveLength(0);
  });

  it("setConnectionLabel: trim 저장, 빈 문자열이면 label 제거 (AC-6)", async () => {
    await useStorage.getState().init();
    useWorkspace.setState({ cards: [card("a"), card("b", 600, 0)] });
    const id = useWorkspace.getState().connectCards("a", "right", "b", "left")!;
    // connectCards의 영속(비동기)이 끝난 뒤 라벨을 저장한다.
    await vi.waitFor(async () => {
      expect(await useStorage.getState().loadConnections(["a"])).toHaveLength(1);
    });

    useWorkspace.getState().setConnectionLabel(id, "  이유  ");
    expect(useWorkspace.getState().connections[0].label).toBe("이유");
    const saved = await vi.waitFor(async () => {
      const list = await useStorage.getState().loadConnections(["a"]);
      expect(list[0]?.label).toBe("이유");
      return list;
    });
    expect(saved[0].label).toBe("이유");

    useWorkspace.getState().setConnectionLabel(id, "   ");
    expect(useWorkspace.getState().connections[0].label).toBeUndefined();
    await vi.waitFor(async () => {
      const list = await useStorage.getState().loadConnections(["a"]);
      expect(list[0].label).toBeUndefined();
    });
  });

  it("selectConnection: 카드 선택과 상호 배타", () => {
    useWorkspace.setState({ cards: [card("a"), card("b", 600, 0)], selectedIds: ["a"] });
    useWorkspace.getState().selectConnection("c1");
    expect(useWorkspace.getState().selectedIds).toEqual([]);
    useWorkspace.getState().selectOne("a");
    expect(useWorkspace.getState().selectedConnectionId).toBeNull();
  });

  it("AC-7: 메모를 휴지통으로 보내면 선이 사라지고 복원하면 같은 변으로 되살아난다", async () => {
    const storage = useStorage.getState();
    await storage.init();
    useWorkspace.setState({
      cards: [card("a"), card("b", 600, 0)],
      connections: [],
    });
    useWorkspace.getState().connectCards("a", "bottom", "b", "top");
    // DB에도 카드가 있어야 trash/restore가 동작.
    await storage.saveNote({ id: "a", boardId: null, content: "" });
    await storage.saveNote({ id: "b", boardId: null, content: "" });

    useWorkspace.getState().remove("a");
    await Promise.resolve();
    expect(useWorkspace.getState().connections).toHaveLength(0);

    await useWorkspace.getState().restoreFromTrash("a");
    const revived = useWorkspace.getState().connections;
    expect(revived).toHaveLength(1);
    expect(revived[0]).toMatchObject({
      sourceNoteId: "a",
      targetNoteId: "b",
      sourceSide: "bottom",
      targetSide: "top",
    });
  });

  it("loadFromStorage: 양 끝이 현재 보드 카드인 active 연결만 싣는다", async () => {
    const storage = useStorage.getState();
    await storage.init();
    await storage.saveNote({ id: "a", boardId: null, content: "" });
    await storage.saveNote({ id: "b", boardId: null, content: "" });
    await storage.saveNote({ id: "c", boardId: "other", content: "" });
    await storage.saveConnection({
      id: "c1",
      sourceNoteId: "a",
      targetNoteId: "b",
      sourceSide: "right",
      targetSide: "left",
    });
    await storage.saveConnection({
      id: "c2",
      sourceNoteId: "a",
      targetNoteId: "c",
    });

    await useWorkspace.getState().loadFromStorage();
    expect(useWorkspace.getState().connections.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("FEAT-connectors · JSON Canvas export", () => {
  it("fromSide/toSide를 스펙 필드명으로 내보낸다", () => {
    const notes = [noteOf("a"), noteOf("b")];
    const conn: Connection = {
      id: "e1",
      sourceNoteId: "a",
      targetNoteId: "b",
      source: "manual",
      status: "active",
      sourceSide: "right",
      targetSide: "left",
      createdAt: 1,
    };
    const doc = buildJsonCanvas(notes, [conn]);
    expect(doc.edges[0]).toMatchObject({
      fromNode: "a",
      toNode: "b",
      fromSide: "right",
      toSide: "left",
    });
  });

  it("side가 없는 레거시 연결은 필드를 넣지 않는다", () => {
    const conn: Connection = {
      id: "e2",
      sourceNoteId: "a",
      targetNoteId: "b",
      source: "ai-suggested",
      status: "active",
      createdAt: 1,
    };
    const doc = buildJsonCanvas([noteOf("a"), noteOf("b")], [conn]);
    expect(doc.edges[0]).not.toHaveProperty("fromSide");
    expect(doc.edges[0]).not.toHaveProperty("toSide");
  });
});
