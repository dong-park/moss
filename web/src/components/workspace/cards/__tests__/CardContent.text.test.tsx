import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderCard } from "./setupCard";

/* Milkdown(ProseMirror)은 jsdom에서 신뢰성이 낮아 MarkdownEditor를 textarea
 * stub으로 모킹한다(MemoExpand.test와 동일 전략). 여기서는 카드↔에디터 사이의
 * 배선(content 표시, onChange→상위, Esc→onCommit, onBlur→onCommit)만 본다. */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({
    value,
    onChange,
    onBlur,
  }: {
    value: string;
    onChange: (md: string) => void;
    onBlur?: () => void;
  }) => (
    <textarea
      data-testid="text-card-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  ),
  ExpandedMarkdownEditor: () => null,
}));

/* TextCardContent — Milkdown 인라인 (cycle 2026-05-28 d).
 * 이전 블록 스택을 Milkdown으로 교체. content는 markdown 문자열로 의미 변경 —
 * onChange 페이로드를 그대로 검증한다(parseBlocks 불필요). */
describe("TextCardContent · UX", () => {
  it("render — 카드 표면이 노란 포스트잇 그라디언트다(n10 결함7 — 흰 종이 PNG 아님)", () => {
    const { container } = renderCard("text", {
      content: "안녕",
      editing: false,
    });
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toContain("gradient-postit");
    expect(root.style.background).not.toContain("text.png");
  });

  it("edit-mode — editing=true에서 에디터가 마운트된다", () => {
    renderCard("text", { content: "메모", editing: true });
    const editor = screen.getByTestId("text-card-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("메모");
  });

  it("Esc — 카드 컨테이너 onKeyDown이 onCommitEdit 호출", () => {
    const { onCommit } = renderCard("text", {
      content: "안녕",
      editing: true,
    });
    const editor = screen.getByTestId("text-card-editor") as HTMLTextAreaElement;
    // 에디터에서 발생한 Esc가 카드 root onKeyDown(버블)으로 올라가 commit.
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(onCommit).toHaveBeenCalled();
  });

  it("Enter — onCommit 트리거되지 않음(텍스트 입력 보존)", () => {
    const { onCommit } = renderCard("text", {
      content: "",
      editing: true,
    });
    const editor = screen.getByTestId("text-card-editor") as HTMLTextAreaElement;
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("onChange — 입력마다 markdown payload 그대로 전달", () => {
    const { onChange } = renderCard("text", {
      content: "",
      editing: true,
    });
    const editor = screen.getByTestId("text-card-editor") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "h" } });
    fireEvent.change(editor, { target: { value: "hi" } });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0][0]).toBe("h");
    expect(onChange.mock.calls[1][0]).toBe("hi");
  });

  it("onBlur — 에디터 blur 시 onCommitEdit 호출 (밖 클릭으로 편집 종료)", () => {
    const { onCommit } = renderCard("text", {
      content: "안녕",
      editing: true,
    });
    const editor = screen.getByTestId("text-card-editor") as HTMLTextAreaElement;
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("CardBlock[] JSON 레거시 content는 blocksToMarkdown으로 표시", () => {
    const json = JSON.stringify([
      { type: "text", text: "안녕" },
      { type: "code", code: "x = 1", lang: "py" },
    ]);
    renderCard("text", { content: json, editing: true });
    const editor = screen.getByTestId("text-card-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("안녕\n\n```py\nx = 1\n```");
  });
});
