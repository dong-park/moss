import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, SYSTEM_BOARD_ID } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { dispatchOp, type BridgeNote } from "@/state/bridge/mossBridge";

// storage 미초기화 → persistCard는 no-op. dispatchOp는 in-memory store만 검증한다.
beforeEach(() => {
  useStorage.setState({ initialized: false });
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
    currentBoardId: SYSTEM_BOARD_ID,
  });
});

describe("dispatchOp", () => {
  it("ping → connected + 현재 보드 id", async () => {
    const r = (await dispatchOp("ping")) as {
      connected: boolean;
      boardId: string;
      cards: number;
    };
    expect(r.connected).toBe(true);
    expect(r.boardId).toBe(SYSTEM_BOARD_ID);
    expect(r.cards).toBe(0);
  });

  it("notes.create → 카드가 store에 추가되고 id 반환", async () => {
    const r = (await dispatchOp("notes.create", { content: "안녕" })) as { id: string };
    expect(r.id).toBeTruthy();
    const cards = useWorkspace.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]!.content).toBe("안녕");
    expect(cards[0]!.kind).toBe("text");
    // 프로그래매틱 생성은 편집/선택을 남기지 않는다.
    expect(useWorkspace.getState().editingId).toBeNull();
    expect(useWorkspace.getState().selectedIds).toHaveLength(0);
  });

  it("notes.create → x/y 좌표 반영, 기본값 40", async () => {
    await dispatchOp("notes.create", { content: "a", x: 100, y: 200 });
    await dispatchOp("notes.create", { content: "b" });
    const cards = useWorkspace.getState().cards;
    expect({ x: cards[0]!.x, y: cards[0]!.y }).toEqual({ x: 100, y: 200 });
    expect({ x: cards[1]!.x, y: cards[1]!.y }).toEqual({ x: 40, y: 40 });
  });

  it("notes.list → BridgeNote 배열", async () => {
    await dispatchOp("notes.create", { content: "x" });
    const list = (await dispatchOp("notes.list")) as BridgeNote[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ content: "x", kind: "text" });
    expect(list[0]).toHaveProperty("id");
    expect(list[0]).toHaveProperty("width");
  });

  it("notes.get → id로 단건 조회, 없으면 throw", async () => {
    const { id } = (await dispatchOp("notes.create", { content: "z" })) as { id: string };
    const got = (await dispatchOp("notes.get", { id })) as BridgeNote;
    expect(got.content).toBe("z");
    await expect(dispatchOp("notes.get", { id: "nope" })).rejects.toThrow("찾을 수 없습니다");
  });

  it("notes.update → 본문 교체, 없으면 throw", async () => {
    const { id } = (await dispatchOp("notes.create", { content: "old" })) as { id: string };
    await dispatchOp("notes.update", { id, content: "new" });
    expect(useWorkspace.getState().cards[0]!.content).toBe("new");
    await expect(dispatchOp("notes.update", { id: "nope", content: "x" })).rejects.toThrow(
      "찾을 수 없습니다",
    );
  });

  it("notes.delete → 카드 제거, 없으면 throw", async () => {
    const { id } = (await dispatchOp("notes.create", { content: "bye" })) as { id: string };
    await dispatchOp("notes.delete", { id });
    expect(useWorkspace.getState().cards).toHaveLength(0);
    await expect(dispatchOp("notes.delete", { id: "nope" })).rejects.toThrow("찾을 수 없습니다");
  });

  it("알 수 없는 op → throw", async () => {
    await expect(dispatchOp("notes.frobnicate")).rejects.toThrow("알 수 없는 op");
  });
});
