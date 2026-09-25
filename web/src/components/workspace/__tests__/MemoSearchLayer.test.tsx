import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { MemoSearchLayer } from "@/components/workspace/MemoSearchLayer";
import { SYSTEM_BOARD_ID, useWorkspace, type Card } from "@/state/workspace";

/** P2-3: memoSearch는 textbox를 매칭하는데 레이어가 kind==="text"만 그려 개수≠목록이었다. */
function setSearch(cards: Card[], ids: string[], query: string) {
  useWorkspace.setState({
    cards,
    selectedIds: [],
    memoSearchQuery: query,
    memoSearchMatchIds: ids,
    viewport: { x: 0, y: 0, scale: 1 },
  });
}

afterEach(() => {
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    memoSearchQuery: "",
    memoSearchMatchIds: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { x: 0, y: 0, scale: 1 },
  });
});

describe("FEAT-memo-fulltext-search · MemoSearchLayer", () => {
  it("textbox 매칭이 결과 목록에 뜬다 (P2-3)", () => {
    const tb: Card = {
      id: "tb",
      kind: "textbox",
      x: 0,
      y: 0,
      width: 120,
      content: "구역 제목",
    };
    setSearch([tb], ["tb"], "구역");

    render(
      <I18nProvider locale="ko">
        <MemoSearchLayer />
      </I18nProvider>,
    );

    expect(screen.getByText("구역 제목")).toBeTruthy();
  });
});
