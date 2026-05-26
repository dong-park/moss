import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderCard } from "./setupCard";

/**
 * 마크다운 메모(text) 카드 — FEAT-markdown-memo-pen.
 *
 * 실제 Milkdown(ProseMirror) 렌더는 jsdom에서 신뢰성이 낮아 브라우저 실측으로 검증한다.
 * 여기서는 MarkdownEditor를 stub로 모킹해 카드↔에디터 배선(value/editable/onChange/
 * onBlur)과 카드 표면 inset만 검증한다.
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({
    value,
    editable,
    onChange,
    onBlur,
  }: {
    value: string;
    editable: boolean;
    onChange: (md: string) => void;
    onBlur?: () => void;
  }) => (
    <textarea
      data-testid="md-editor"
      data-editable={String(editable)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  ),
}));

describe("마크다운 메모 카드 · 배선", () => {
  it("render — 카드 표면 background에 cards/v2/text.png 포함", () => {
    const { container } = renderCard("text", { content: "안녕", editing: false });
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toContain("cards/v2/text.png");
  });

  it("editing=true → 에디터가 editable로 마운트", () => {
    renderCard("text", { content: "# 제목", editing: true });
    const ed = screen.getByTestId("md-editor");
    expect(ed.getAttribute("data-editable")).toBe("true");
    expect((ed as HTMLTextAreaElement).value).toBe("# 제목");
  });

  it("editing=false → readonly(editable=false)", () => {
    renderCard("text", { content: "메모", editing: false });
    expect(screen.getByTestId("md-editor").getAttribute("data-editable")).toBe(
      "false",
    );
  });

  it("onChange — 마크다운 문자열을 그대로 상위로 전달", () => {
    const { onChange } = renderCard("text", { content: "", editing: true });
    fireEvent.change(screen.getByTestId("md-editor"), {
      target: { value: "- [ ] 할 일" },
    });
    expect(onChange).toHaveBeenCalledWith("- [ ] 할 일");
  });

  it("blur → onCommitEdit", () => {
    const { onCommit } = renderCard("text", { content: "x", editing: true });
    fireEvent.blur(screen.getByTestId("md-editor"));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("Esc(컨테이너) → onCommitEdit", () => {
    const { onCommit } = renderCard("text", { content: "x", editing: true });
    fireEvent.keyDown(screen.getByTestId("md-editor"), { key: "Escape" });
    expect(onCommit).toHaveBeenCalled();
  });
});
