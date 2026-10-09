import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace, type Card } from "@/state/workspace";
import { TextCardContent } from "../Content";

/* spec/card-faces.md — 할 일 앞면은 카드에서 바로 고친다. */

const ID = "todo-1";
const card = () => useWorkspace.getState().cards.find((c) => c.id === ID)!;

function renderFace(editing = true) {
  return render(
    <I18nProvider locale="ko">
      <div data-card-id={ID}>
        <TextCardContent card={card()} editing={editing} onChange={() => {}} onCommitEdit={() => {}} />
      </div>
    </I18nProvider>,
  );
}

beforeEach(() => {
  useWorkspace.setState({
    cards: [{ id: ID, kind: "text", x: 0, y: 0, width: 240, height: 240, content: "- [x] 여권\n- [ ] 우산" } as Card],
  });
});

describe("TodoFace", () => {
  it("항목 수정·Enter 추가·상자 토글이 본문 마크다운에 쓰인다", () => {
    const { rerender } = renderFace();
    const editing = true;
    const rerenderFace = () =>
      rerender(
        <I18nProvider locale="ko">
          <div data-card-id={ID}>
            <TextCardContent card={card()} editing={editing} onChange={() => {}} onCommitEdit={() => {}} />
          </div>
        </I18nProvider>,
      );

    const items = screen.getAllByLabelText("할 일 항목") as HTMLInputElement[];
    expect(items.map((i) => i.value)).toEqual(["여권", "우산"]);

    fireEvent.change(items[1], { target: { value: "우산 2개" } });
    expect(card().content).toBe("- [x] 여권\n- [ ] 우산 2개");
    rerenderFace();

    fireEvent.keyDown(screen.getAllByLabelText("할 일 항목")[1], { key: "Enter" });
    expect(card().content).toBe("- [x] 여권\n- [ ] 우산 2개\n- [ ] ");
    rerenderFace();

    fireEvent.click(screen.getAllByLabelText("완료 표시")[0]);
    expect(card().content).toBe("- [ ] 여권\n- [ ] 우산 2개\n- [ ] ");
  });

  it("빈 항목에서 Backspace면 그 항목을 지운다", () => {
    useWorkspace.setState({
      cards: [{ ...card(), content: "- [ ] 여권\n- [ ] " }],
    });
    renderFace();
    fireEvent.keyDown(screen.getAllByLabelText("할 일 항목")[1], { key: "Backspace" });
    expect(card().content).toBe("- [ ] 여권");
  });

  it("편집 전엔 입력칸이 읽기 전용이고 줄 클릭이 체크를 토글한다", () => {
    renderFace(false);
    const items = screen.getAllByLabelText("할 일 항목") as HTMLInputElement[];
    expect(items[1].readOnly).toBe(true);
    fireEvent.click(items[1].closest("li")!);
    expect(card().content).toBe("- [x] 여권\n- [x] 우산");
  });
});
