import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { useWorkspace } from "@/state/workspace";
import { CardContent } from "@/components/workspace/cards/CardContent";
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
  it("render — 카드 표면 background에 cards/v2/text.png 포함", () => {
    const { container } = renderCard("text", {
      content: "안녕",
      editing: false,
    });
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toContain("cards/v2/text.png");
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

  it("onBlur — 편집을 끝내도 빈 메모가 삭제되지 않는다 (FEAT-memo-empty-keep AC-1)", () => {
    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 300, content: "" }],
    });
    const { onCommit } = renderCard("text", { content: "", editing: true });
    fireEvent.blur(screen.getByTestId("text-card-editor"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === "c1"),
    ).toBeDefined();
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

/* FEAT-memo-title-front-edit — 앞면 제목 편집 배선(AC-1·AC-3·AC-4). */
describe("TextCardContent · 앞면 제목 편집", () => {
  const card = {
    id: "c1",
    kind: "text" as const,
    x: 0,
    y: 0,
    width: 300,
    content: "",
  };

  function renderInCard(editing: boolean, onCommit: () => void) {
    return render(
      <I18nProvider locale="ko">
        <div data-card-id="c1">
          <CardContent
            card={card}
            editing={editing}
            onChange={vi.fn()}
            onCommitEdit={onCommit}
          />
        </div>
      </I18nProvider>,
    );
  }

  it("편집 모드에서는 제목이 비어도 입력 줄을 그린다 (AC-1)", () => {
    renderCard("text", { content: "", editing: true });
    expect(screen.getByLabelText("메모 제목")).toBeTruthy();
  });

  it("읽기 전용 + 제목 없음 → 제목 줄이 없다 (AC-9)", () => {
    renderCard("text", { content: "", editing: false });
    expect(screen.queryByLabelText("메모 제목")).toBeNull();
  });

  it("같은 카드 안 포커스 이동은 편집 종료를 부르지 않는다 (AC-3)", () => {
    const onCommit = vi.fn();
    renderInCard(true, onCommit);
    const title = screen.getByLabelText("메모 제목");
    const body = screen.getByTestId("text-card-editor");
    fireEvent.blur(title, { relatedTarget: body });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("카드 밖으로 나가면 편집을 끝낸다 (AC-4)", () => {
    const onCommit = vi.fn();
    renderInCard(true, onCommit);
    fireEvent.blur(screen.getByLabelText("메모 제목"), {
      relatedTarget: document.body,
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
