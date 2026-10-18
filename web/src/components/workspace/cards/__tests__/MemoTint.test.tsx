import { describe, expect, it, vi } from "vitest";
import { renderCard } from "./setupCard";
import { MEMO_COLORS, MEMO_TINTS, memoTint } from "@/components/workspace/memoVariety";

/**
 * FEAT-memo-variety AC-2 — 앞면 색조 층.
 * 종이 png 배경을 대체하지 않고 위에 multiply로 얹히며, 같은 png로 mask되어
 * 종이 바깥 투명부엔 칠하지 않는다. 색 결정 규칙은 memoVariety.test.ts가 덮는다.
 */
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="md">{value}</div>
  ),
  ExpandedMarkdownEditor: () => null,
}));

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe("FEAT-memo-variety · 색조 층", () => {
  it("FT-7: 앞면은 종이 사진 없이 CSS 포스트잇 면이다", () => {
    const { container } = renderCard("text", { content: "안녕", editing: false });
    const root = container.firstChild as HTMLElement;
    expect(root.outerHTML).not.toContain("text.png");
    expect(root.style.backgroundImage).toContain("linear-gradient"); // 접착 띠
  });

  it("FT-7: 색을 안 고르면 기본 노랑이 앞면 배경색이 된다", () => {
    const { container } = renderCard("text", {
      content: "안녕",
      editing: false,
      card: { id: "c1" },
    });
    const root = container.firstChild as HTMLElement;
    const tintColor = memoTint("c1");
    expect(MEMO_TINTS.includes(tintColor as (typeof MEMO_TINTS)[number])).toBe(true);
    expect(root.style.backgroundColor).toBe(hexToRgb(tintColor));
  });

  it("FT-7: 고른 색이 앞면 배경색이 된다", () => {
    const { container } = renderCard("text", {
      content: "본문",
      editing: false,
      card: { id: "c1", color: "blue" },
    });
    const root = container.firstChild as HTMLElement;
    expect(root.style.backgroundColor).toBe(hexToRgb(MEMO_COLORS.blue));
  });
});
