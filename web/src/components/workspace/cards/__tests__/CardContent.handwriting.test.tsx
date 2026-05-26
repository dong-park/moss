import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import {
  parseHandwriting,
  serializeHandwriting,
  type HandwritingPoint,
} from "@/state/cardContent";
import { renderCard } from "./setupCard";

/** 키보드 이벤트를 받는 wrapper(tabIndex=0). svg는 자식. */
function handwritingRoot(container: HTMLElement): HTMLDivElement {
  const root = container.querySelector(
    'div[tabindex="0"]',
  ) as HTMLDivElement | null;
  if (!root) throw new Error("handwriting wrapper not found");
  return root;
}

function pointsLine(
  from: [number, number],
  to: [number, number],
  n = 4,
): HandwritingPoint[] {
  const out: HandwritingPoint[] = [];
  for (let i = 0; i <= n; i++) {
    out.push({
      x: from[0] + ((to[0] - from[0]) * i) / n,
      y: from[1] + ((to[1] - from[1]) * i) / n,
    });
  }
  return out;
}

describe("HandwritingCardContent · 키보드 UX", () => {
  it("render — handwriting 표면(cards/v2/handwriting.png)에 svg를 그린다", () => {
    const initial = serializeHandwriting({
      paths: [pointsLine([0, 0], [10, 10])],
    });
    const { container } = renderCard("handwriting", initial);

    const root = handwritingRoot(container);
    expect(root.style.background).toContain("cards/v2/handwriting.png");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("Cmd+Z — 마지막 stroke를 제거한다 (paths.length -1)", () => {
    const initial = serializeHandwriting({
      paths: [pointsLine([0, 0], [5, 5]), pointsLine([6, 6], [12, 12])],
    });
    const { onChange, container } = renderCard("handwriting", initial);

    fireEvent.keyDown(handwritingRoot(container), { key: "z", metaKey: true });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = parseHandwriting(onChange.mock.calls[0][0]);
    expect(next.paths).toHaveLength(1);
    expect(next.paths[0][0]).toEqual({ x: 0, y: 0 });
  });

  it("Cmd+Shift+Z — undo된 stroke를 복원한다", () => {
    const stroke1 = pointsLine([0, 0], [5, 5]);
    const stroke2 = pointsLine([6, 6], [12, 12]);
    const initial = serializeHandwriting({ paths: [stroke1, stroke2] });
    const { onChange, container, rerenderWith } = renderCard(
      "handwriting",
      initial,
    );

    // undo → paths = [stroke1]
    fireEvent.keyDown(handwritingRoot(container), { key: "z", metaKey: true });
    const afterUndo = onChange.mock.calls[0][0];
    rerenderWith(afterUndo);

    // redo (Cmd+Shift+Z) → paths = [stroke1, stroke2] 다시
    fireEvent.keyDown(handwritingRoot(container), {
      key: "z",
      metaKey: true,
      shiftKey: true,
    });

    expect(onChange).toHaveBeenCalledTimes(2);
    const restored = parseHandwriting(onChange.mock.calls[1][0]);
    expect(restored.paths).toHaveLength(2);
    expect(restored.paths[1][restored.paths[1].length - 1]).toEqual({
      x: 12,
      y: 12,
    });
  });

  it("Cmd+Backspace — 전체 strokes 비움", () => {
    const initial = serializeHandwriting({
      paths: [pointsLine([0, 0], [5, 5]), pointsLine([6, 6], [12, 12])],
    });
    const { onChange, container } = renderCard("handwriting", initial);

    fireEvent.keyDown(handwritingRoot(container), {
      key: "Backspace",
      metaKey: true,
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = parseHandwriting(onChange.mock.calls[0][0]);
    expect(next.paths).toEqual([]);
  });

  it("[ / ] — 펜 굵기를 -1 / +1 변경한다 (polyline strokeWidth 반영)", () => {
    const { container } = renderCard("handwriting", "");
    const root = handwritingRoot(container);

    const widthBadge = () => root.textContent ?? "";

    // 초기 1.5
    expect(widthBadge()).toContain("1.5");

    // ] → 2.5
    fireEvent.keyDown(root, { key: "]" });
    expect(widthBadge()).toContain("2.5");

    // ] → 3.5
    fireEvent.keyDown(root, { key: "]" });
    expect(widthBadge()).toContain("3.5");

    // [ → 2.5
    fireEvent.keyDown(root, { key: "[" });
    expect(widthBadge()).toContain("2.5");
  });

  it("Esc — onCommitEdit을 1회 호출한다", () => {
    const { onCommit, container } = renderCard("handwriting", "");
    fireEvent.keyDown(handwritingRoot(container), { key: "Escape" });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
