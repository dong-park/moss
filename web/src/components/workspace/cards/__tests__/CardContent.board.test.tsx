import { afterEach, describe, expect, it } from "vitest";
import { useWorkspace } from "@/state/workspace";
import { renderCard } from "./setupCard";

/**
 * 2026-09-23 마닐라 폴더 개선: 파일함 카드가 흔한 UI 타일(파란 플라스틱 상자 +
 * 이름/개수 텍스트)에서 메모와 같은 "실사 사물"로 바뀐다 — 접지 그림자·탭·
 * 삐져나온 종이 레이어. 이름은 앞판에, 개수는 탭에 표시한다.
 */

afterEach(() => {
  useWorkspace.setState({ subcanvasCounts: {}, dropTargetFunnelId: null });
});

describe("BoardCardContent · 마닐라 폴더", () => {
  it("파란 상자 아이콘 img 대신 마닐라 폴더 PNG 배경을 쓴다", () => {
    const { container } = renderCard("board", {
      content: "",
      editing: false,
      card: { boardRef: "b1" },
    });
    expect(container.textContent).not.toContain("📦");
    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector("[data-board-back]")?.getAttribute("style"),
    ).toContain("/cards/v2/board-back.png");
    expect(
      container.querySelector("[data-board-front]")?.getAttribute("style"),
    ).toContain("/cards/v2/board-front.png");
  });

  it("이름이 없으면 '이름 없는 캔버스' 대신 '이름 없는 파일함'을 보여준다", () => {
    useWorkspace.setState({
      boards: [
        {
          id: "b1",
          name: "",
          isSystem: false,
          parentBoardId: null,
          createdAt: 0,
          updatedAt: 0,
          lastOpenedAt: 0,
        },
      ],
    });
    const { container } = renderCard("board", {
      content: "",
      editing: false,
      card: { boardRef: "b1" },
    });
    const name = container.querySelector("[data-board-name]");
    expect(name?.textContent).toBe("이름 없는 파일함");
    expect(name?.getAttribute("style")).toContain("rgba(60, 52, 36, 0.48)");
    expect(container.textContent).not.toContain("이름 없는 캔버스");
  });

  it("카드 개수를 탭에 짧게 보여주고 앞판에는 이름만 둔다", () => {
    useWorkspace.setState({ subcanvasCounts: { b1: 3 } });
    const { container } = renderCard("board", {
      content: "",
      editing: false,
      card: { boardRef: "b1" },
    });
    expect(container.querySelector("[data-board-count]")?.textContent).toBe("3개");
    expect(container.querySelector("[data-board-name]")?.textContent).not.toContain("개");
  });

  it("앞판 이름은 두 줄로 제한하고 원문을 title에 보존한다", () => {
    const fullName = "여덟글자파일함이름과추가문구";
    useWorkspace.setState({
      boards: [{ id: "b1", name: fullName, isSystem: false, parentBoardId: null, createdAt: 0, updatedAt: 0, lastOpenedAt: 0 }],
    });
    const { container } = renderCard("board", { card: { boardRef: "b1" } });
    const name = container.querySelector("[data-board-name]");
    expect(name?.getAttribute("title")).toBe(fullName);
    expect(name?.getAttribute("style")).toContain("-webkit-line-clamp: 2");
  });

  it("100개 이상은 탭에 99+로 줄이고 종이는 high에서 멈춘다", () => {
    useWorkspace.setState({ subcanvasCounts: { b1: 143 } });
    const { container } = renderCard("board", { card: { boardRef: "b1" } });
    expect(container.querySelector("[data-board-count]")?.textContent).toBe("99+");
    expect(container.querySelector("[data-board-papers]")?.getAttribute("data-board-papers")).toBe("high");
  });

  it("0장이면 삐져나온 종이 레이어가 없고, 1~3장이면 low, 4장 이상이면 high", () => {
    const renderWithCount = (count: number) => {
      useWorkspace.setState({ subcanvasCounts: { b1: count } });
      const { container } = renderCard("board", {
        content: "",
        editing: false,
        card: { boardRef: "b1" },
      });
      return container.querySelector("[data-board-papers]");
    };
    expect(renderWithCount(0)).toBeNull();
    expect(renderWithCount(2)?.getAttribute("data-board-papers")).toBe("low");
    expect(renderWithCount(7)?.getAttribute("data-board-papers")).toBe("high");
  });

  it("삐져나온 종이는 실사 원본 레이어를 쓴다", () => {
    useWorkspace.setState({ subcanvasCounts: { b1: 2 } });
    const { container } = renderCard("board", {
      content: "",
      editing: false,
      card: { boardRef: "b1" },
    });
    expect(container.querySelector("[data-board-papers-tint]")).toBeNull();
    expect(
      container.querySelector("[data-board-papers]")?.getAttribute("style"),
    ).toContain("board-papers-low.png");
  });

  it("드롭 대상이면 앞판이 살짝 내려가 함이 벌어진 느낌을 준다", () => {
    useWorkspace.setState({
      subcanvasCounts: { b1: 1 },
      dropTargetFunnelId: "c1",
    });
    const { container } = renderCard("board", {
      content: "",
      editing: false,
      card: { boardRef: "b1" },
    });
    expect(
      container.querySelector("[data-board-front]")?.getAttribute("style"),
    ).toContain("translateY(2.5%)");
  });
});
