import { describe, expect, it } from "vitest";
import type { EditorView } from "@milkdown/prose/view";
import { titleArrowUpKeydown } from "../titleArrowUp";

/* FEAT-memo-title-front-edit f4 — 맨 앞 ArrowUp만 소비한다 (AC-5). */
function fakeView(over: Partial<EditorView> = {}): EditorView {
  return {
    editable: true,
    endOfTextblock: () => true,
    dom: document.createElement("div"),
    ...over,
  } as unknown as EditorView;
}

const arrowUp = { key: "ArrowUp" } as KeyboardEvent;

describe("titleArrowUpKeydown", () => {
  it("커서가 맨 앞이면 키를 소비한다", () => {
    expect(titleArrowUpKeydown(fakeView(), arrowUp)).toBe(true);
  });

  it("맨 앞이 아니면 소비하지 않는다 — 기본 이동에 넘긴다", () => {
    expect(
      titleArrowUpKeydown(fakeView({ endOfTextblock: () => false }), arrowUp),
    ).toBe(false);
  });

  it("읽기 전용이면 소비하지 않는다", () => {
    expect(
      titleArrowUpKeydown(fakeView({ editable: false }), arrowUp),
    ).toBe(false);
  });

  it("다른 키는 건드리지 않는다", () => {
    expect(
      titleArrowUpKeydown(fakeView(), { key: "ArrowDown" } as KeyboardEvent),
    ).toBe(false);
  });
});
