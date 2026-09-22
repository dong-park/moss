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

  /* 2026-09-22 사용자 결정: 메모지 앞면은 제목 하나만 정가운데에 보여준다.
   * 본문 에디터·펜 overlay·백링크는 앞면에서 빠졌다 — 메모 창(MemoExpand)이 맡는다.
   * 아래 세 개가 새 계약이고, 옛 "앞면 본문 편집" 검사는 창 쪽 테스트가 덮는다. */
  it("앞면에는 본문 에디터가 없다", () => {
    renderCard("text", { content: "메모", editing: false });
    expect(screen.queryByTestId("text-card-editor")).toBeNull();
  });

  it("앞면 제목은 가운데 정렬로 보인다", () => {
    renderCard("text", {
      content: "본문",
      editing: false,
      card: { title: "회의 메모" },
    });
    const title = screen.getByText("회의 메모") as HTMLElement;
    expect(title.style.textAlign).toBe("center");
  });

  it("제목이 비면 안내 글씨를 보여준다 — 누를 자리", () => {
    renderCard("text", { content: "", editing: false });
    expect(screen.getByText("무슨 생각이 드나요?")).toBeTruthy();
  });

  it("Esc — 카드 컨테이너 onKeyDown이 onCommitEdit 호출", () => {
    const { onCommit } = renderCard("text", { content: "안녕", editing: true });
    fireEvent.keyDown(screen.getByLabelText("메모 제목"), { key: "Escape" });
    expect(onCommit).toHaveBeenCalled();
  });

  it("제목 편집을 끝내도 빈 메모가 삭제되지 않는다 (FEAT-memo-empty-keep AC-1)", () => {
    useWorkspace.setState({
      cards: [{ id: "c1", kind: "text", x: 0, y: 0, width: 300, content: "" }],
    });
    const { onCommit } = renderCard("text", { content: "", editing: true });
    fireEvent.blur(screen.getByLabelText("메모 제목"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(
      useWorkspace.getState().cards.find((c) => c.id === "c1"),
    ).toBeDefined();
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
    // 앞면에 본문 에디터가 없으므로 같은 카드 안 다른 요소(카드 루트)로 옮긴다.
    const sameCard = document.querySelector('[data-card-id="c1"]')!;
    fireEvent.blur(title, { relatedTarget: sameCard });
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
