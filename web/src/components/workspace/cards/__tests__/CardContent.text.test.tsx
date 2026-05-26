import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { parseBlocks } from "@/state/cardContent";
import { renderCard } from "./setupCard";

/**
 * Text 카드 — 올인원 블록 스택(FEAT-card-allinone).
 * content는 CardBlock[] JSON으로 직렬화되므로 onChange 페이로드는 parseBlocks로 검증한다.
 */
describe("TextCardContent · UX", () => {
  it("render — 카드 표면 background에 cards/v2/text.png 포함", () => {
    const { container } = renderCard("text", {
      content: "안녕",
      editing: false,
    });

    // 표면 컨테이너는 최상위 div (cardSurface 호출 위치).
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toContain("cards/v2/text.png");
  });

  it("edit-mode — editing=true에서 textarea가 마운트되고 포커스된다", () => {
    renderCard("text", { content: "메모", editing: true });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    // EditableBlock useEffect: editing 시 focus + select
    expect(document.activeElement).toBe(textarea);
  });

  it("Esc — onCommitEdit 1회 호출 (중복 X)", () => {
    const { onCommit } = renderCard("text", {
      content: "안녕",
      editing: true,
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Esc → textarea가 blur → onBlur가 onCommit 호출.
    // 카드 컨테이너 onKeyDown은 textarea 이벤트를 위임(early return)하므로
    // 중복 호출되지 않아야 한다.
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("Enter — 줄바꿈 (default 유지, onCommitEdit 트리거되지 않음)", () => {
    const { onChange, onCommit } = renderCard("text", {
      content: "",
      editing: true,
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Enter는 textarea default(줄바꿈)여야 하므로 commit가 호출되지 않아야 한다.
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();

    // 실제 줄바꿈 페이로드는 onChange로 들어와야 한다(브라우저 default 동작 시뮬).
    fireEvent.change(textarea, { target: { value: "first\nsecond" } });
    const payload = onChange.mock.calls.at(-1)![0];
    expect(parseBlocks(payload)).toEqual([{ type: "text", text: "first\nsecond" }]);
  });

  it("onChange — 입력마다 onChange 호출(페이로드 = 최신 값)", () => {
    const { onChange } = renderCard("text", {
      content: "",
      editing: true,
    });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "h" } });
    fireEvent.change(textarea, { target: { value: "hi" } });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(parseBlocks(onChange.mock.calls[0][0])).toEqual([{ type: "text", text: "h" }]);
    expect(parseBlocks(onChange.mock.calls[1][0])).toEqual([{ type: "text", text: "hi" }]);
  });
});
