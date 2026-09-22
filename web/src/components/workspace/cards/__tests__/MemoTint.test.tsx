import { describe, expect, it, vi } from "vitest";
import { renderCard } from "./setupCard";
import { MEMO_TINTS, memoTint } from "@/components/workspace/memoVariety";

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
  it("AC-2: 앞면 배경은 여전히 cards/v2/text.png다", () => {
    const { container } = renderCard("text", { content: "안녕", editing: false });
    const root = container.firstChild as HTMLElement;
    expect(root.style.background).toContain("cards/v2/text.png");
  });

  it("AC-2: 색조 층이 팔레트 색으로 multiply로 얹히고 같은 png로 mask된다", () => {
    const { container } = renderCard("text", {
      content: "안녕",
      editing: false,
      card: { id: "c1" },
    });
    const tint = container.querySelector("[data-memo-tint]") as HTMLElement;
    expect(tint).toBeTruthy();

    const tintColor = memoTint("c1");
    expect(MEMO_TINTS.includes(tintColor as (typeof MEMO_TINTS)[number])).toBe(true);
    // 색은 인라인 background(shorthand)로 들어간다 — jsdom은 rgb로 정규화한다.
    expect(tint.style.background || tint.style.backgroundColor).toBe(
      hexToRgb(tintColor),
    );
    expect(tint.style.mixBlendMode).toBe("multiply");

    const css = tint.getAttribute("style") ?? "";
    expect(css).toContain("cards/v2/text.png"); // mask가 배경과 같은 png
    // 클릭을 가로채지 않는다 — Tailwind 클래스로 pointer-events:none.
    expect(tint.className).toContain("pointer-events-none");
    expect(tint.className).toContain("absolute");
  });

  it("AC-2: 색조 층이 글자보다 아래에 있다(문서 순서)", () => {
    const { container } = renderCard("text", {
      content: "본문",
      editing: false,
      card: { id: "c1" },
    });
    const tint = container.querySelector("[data-memo-tint]") as HTMLElement;
    const editor = container.querySelector('[data-testid="md"]') as HTMLElement;
    // tint가 editor보다 앞 → 형제 페인트 순서에서 아래.
    const rel = tint.compareDocumentPosition(editor);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
