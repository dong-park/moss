import { afterEach, describe, expect, it } from "vitest";
import { useWorkspace, type Card } from "@/state/workspace";

/**
 * FEAT-memo-expand — 펼치기 모달 상태(expandedCardId) 스토어 동작.
 * setExpandedCard 상호배타(inline 편집 종료)와 카드 삭제 시 정리를 검증한다.
 */

const card = (id: string): Card => ({
  id,
  kind: "text",
  x: 0,
  y: 0,
  width: 300,
  content: "",
});

function seed(cards: Card[]) {
  useWorkspace.setState({
    cards,
    selectedIds: [],
    editingId: null,
    expandedCardId: null,
  });
}

afterEach(() => {
  seed([]);
});

describe("FEAT-memo-expand · expandedCardId", () => {
  it("setExpandedCard(id) → expandedCardId 설정 + inline 편집 종료(상호배타)", () => {
    seed([card("a")]);
    useWorkspace.setState({ editingId: "a" });
    useWorkspace.getState().setExpandedCard("a");
    expect(useWorkspace.getState().expandedCardId).toBe("a");
    expect(useWorkspace.getState().editingId).toBeNull();
  });

  it("setExpandedCard(null) → 닫힘", () => {
    seed([card("a")]);
    useWorkspace.getState().setExpandedCard("a");
    useWorkspace.getState().setExpandedCard(null);
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });

  it("remove — 펼친 카드가 삭제되면 expandedCardId 정리", () => {
    seed([card("a"), card("b")]);
    useWorkspace.getState().setExpandedCard("a");
    useWorkspace.getState().remove("a");
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });

  it("remove — 다른 카드 삭제는 펼침 상태 유지", () => {
    seed([card("a"), card("b")]);
    useWorkspace.getState().setExpandedCard("a");
    useWorkspace.getState().remove("b");
    expect(useWorkspace.getState().expandedCardId).toBe("a");
  });

  it("removeSelected — 펼친 카드가 선택 삭제되면 정리", () => {
    seed([card("a"), card("b")]);
    useWorkspace.setState({ selectedIds: ["a"] });
    useWorkspace.getState().setExpandedCard("a");
    useWorkspace.getState().removeSelected();
    expect(useWorkspace.getState().expandedCardId).toBeNull();
  });
});
