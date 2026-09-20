import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoTitleRow } from "../MemoTitleRow";
import { MEMO_TITLE_ROW_HEIGHT } from "../memoLayout";

describe("MemoTitleRow — 렌더 (AC-2·AC-3·AC-5)", () => {
  it("읽기 전용 + 제목 없음 → null (앞면은 제목 줄을 그리지 않는다)", () => {
    const { container } = render(<MemoTitleRow title="" />);
    expect(container.firstChild).toBeNull();
  });

  it("읽기 전용 + 제목 있음 → 굵은 한 줄, 높이 상수 고정", () => {
    render(<MemoTitleRow title="주간 회고" />);
    const el = screen.getByText("주간 회고");
    expect(el.style.height).toBe(`${MEMO_TITLE_ROW_HEIGHT}px`);
    expect(el.className).toContain("whitespace-nowrap");
    expect(el.className).toContain("text-ellipsis");
  });

  it("편집 가능 → 항상 입력 줄. placeholder·aria-label 있음", () => {
    render(<MemoTitleRow editable title="" />);
    const input = screen.getByLabelText("메모 제목") as HTMLInputElement;
    expect(input.placeholder).toBe("제목");
    expect(input.style.height).toBe(`${MEMO_TITLE_ROW_HEIGHT}px`);
  });

  it("긴 제목도 같은 높이 상수를 쓴다 (AC-6)", () => {
    render(<MemoTitleRow title={"가".repeat(80)} />);
    const el = screen.getByText("가".repeat(80));
    expect(el.style.height).toBe(`${MEMO_TITLE_ROW_HEIGHT}px`);
  });
});
