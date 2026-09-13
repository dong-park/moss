import { describe, expect, it } from "vitest";
import { useWorkspace } from "@/state/workspace";
import { renderCard } from "./setupCard";

/**
 * FEAT-sticky-redesign n10 브라우저 결함6: 파일함 카드가 옛 디자인(📦 이모지 +
 * "이름 없는 캔버스")으로 남아 있었다 — 시안(파스텔 블루 파일박스 아이콘 +
 * "파일함"/"이름 없는 파일함")과 다르다. 카드 개수 표시는 그대로 유지한다.
 */
describe("BoardCardContent · n10 결함6 파일함 디자인", () => {
  it("📦 이모지 대신 filebox 아이콘(img)을 쓴다", () => {
    const { container } = renderCard("board", {
      content: "",
      editing: false,
      card: { boardRef: "b1" },
    });
    expect(container.textContent).not.toContain("📦");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("/icons/dock/filebox.png");
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
    expect(container.textContent).toContain("이름 없는 파일함");
    expect(container.textContent).not.toContain("이름 없는 캔버스");
  });
});
