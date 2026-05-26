import { describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { parseBlocks, serializeBlocks, type CardBlock } from "@/state/cardContent";
import { renderCard } from "./setupCard";

/** FEAT-card-allinone — 글 카드 올인원 블록 스택 렌더·추가·삭제·이동·블록별 편집. */

const content = (blocks: CardBlock[]) => serializeBlocks(blocks);

describe("TextCardContent · 올인원 블록", () => {
  it("AC-1: text/code/handwriting 블록을 추가 순서대로 렌더", () => {
    const { container } = renderCard("text", {
      editing: false,
      content: content([
        { type: "text", text: "노트입니다" },
        { type: "code", code: "const x = 1", lang: "ts" },
        { type: "handwriting", paths: [[{ x: 0, y: 0 }, { x: 5, y: 5 }]] },
      ]),
    });

    expect(screen.getByText("노트입니다")).not.toBeNull();
    expect(screen.getByText("const x = 1")).not.toBeNull();
    expect(container.querySelector("svg polyline")).not.toBeNull();
  });

  it("AC-2: '+ 코드' → 맨 아래 빈 code 블록 추가", () => {
    const { onChange } = renderCard("text", {
      editing: true,
      content: content([{ type: "text", text: "hi" }]),
    });

    fireEvent.click(screen.getByRole("button", { name: "+ 코드" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(parseBlocks(onChange.mock.calls[0][0])).toEqual([
      { type: "text", text: "hi" },
      { type: "code", code: "" },
    ]);
  });

  it("AC-4: 가운데 블록 삭제", () => {
    const { onChange } = renderCard("text", {
      editing: true,
      content: content([
        { type: "text", text: "A" },
        { type: "text", text: "B" },
        { type: "text", text: "C" },
      ]),
    });

    const dels = screen.getAllByRole("button", { name: "블록 삭제" });
    fireEvent.click(dels[1]);

    expect(parseBlocks(onChange.mock.calls[0][0])).toEqual([
      { type: "text", text: "A" },
      { type: "text", text: "C" },
    ]);
  });

  it("AC-4: ↓로 블록 순서 교환", () => {
    const { onChange } = renderCard("text", {
      editing: true,
      content: content([
        { type: "text", text: "A" },
        { type: "text", text: "B" },
      ]),
    });

    // 첫 블록의 "아래로" → A·B 교환.
    fireEvent.click(screen.getAllByLabelText("아래로")[0]);

    expect(parseBlocks(onChange.mock.calls[0][0])).toEqual([
      { type: "text", text: "B" },
      { type: "text", text: "A" },
    ]);
  });

  it("AC-3: code 블록 Tab → 해당 블록만 2 spaces 삽입", () => {
    const { onChange } = renderCard("text", {
      editing: true,
      content: content([{ type: "code", code: "ab" }]),
    });

    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => {
      ta.focus();
      ta.setSelectionRange(1, 1);
    });
    fireEvent.keyDown(ta, { key: "Tab" });

    expect(parseBlocks(onChange.mock.calls[0][0])).toEqual([
      { type: "code", code: "a  b" },
    ]);
  });

  it("AC-3: handwriting 블록 Cmd+Z → 해당 블록 마지막 stroke 제거", () => {
    const s1 = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    const s2 = [{ x: 6, y: 6 }, { x: 9, y: 9 }];
    const { onChange, container } = renderCard("text", {
      editing: true,
      content: content([{ type: "handwriting", paths: [s1, s2] }]),
    });

    const canvas = container.querySelector('[data-card-canvas]') as HTMLElement;
    fireEvent.keyDown(canvas, { key: "z", metaKey: true });

    expect(parseBlocks(onChange.mock.calls[0][0])).toEqual([
      { type: "handwriting", paths: [s1] },
    ]);
  });

  it("빈 카드(content='')는 빈 text 블록 1개로 편집 진입", () => {
    renderCard("text", { editing: true, content: "" });
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    // 진입 자동 포커스 타겟 표시.
    expect(ta.getAttribute("data-card-input")).not.toBeNull();
  });
});
