import { beforeEach, describe, expect, it } from "vitest";
import {
  plainText,
  searchMemos,
  __clearPlainCache,
} from "@/state/memoSearch";
import type { Card } from "@/state/workspace";

/** 테스트용 최소 카드 — 검색에 필요한 필드만 채운다. */
function card(id: string, content: string, kind: Card["kind"] = "text"): Card {
  return { id, kind, x: 0, y: 0, width: 200, content };
}

beforeEach(() => {
  __clearPlainCache();
});

describe("plainText — markdown 평문화 (AC-1: 대소문자·기호 무시)", () => {
  it("빈/무효 입력은 빈 문자열", () => {
    expect(plainText("")).toBe("");
    expect(plainText("   ")).toBe("");
  });

  it("제목·강조·인용 기호를 제거하고 소문자화", () => {
    expect(plainText("# 회고")).toBe("회고");
    expect(plainText("**Hello** _World_")).toBe("hello world");
    expect(plainText("> 인용 회고")).toBe("인용 회고");
    expect(plainText("- 항목 회고")).toBe("항목 회고");
    expect(plainText("1. 첫째 회고")).toBe("첫째 회고");
  });

  it("링크·이미지·인라인코드는 표시 텍스트만 남김", () => {
    expect(plainText("[회고](https://x.com)")).toBe("회고");
    expect(plainText("![대체](img.png) 회고")).toBe("대체 회고");
    expect(plainText("`code` 회고")).toBe("code 회고");
    expect(plainText("[[위키 회고]]")).toBe("위키 회고");
  });

  it("펜스 코드블록은 내부 코드만 남김", () => {
    expect(plainText("```ts\nconst 회고 = 1\n```")).toBe("const 회고 = 1");
  });

  it("블록 JSON(레거시 카드)도 blocksToMarkdown으로 평문화", () => {
    const json = JSON.stringify([{ type: "text", text: "# 회고\n둘째" }]);
    expect(plainText(json)).toBe("회고 둘째");
  });
});

describe("searchMemos — 매칭·랭킹 (AC-1)", () => {
  it("본문에 '회고' 포함 메모 3장 → 3장 매칭(대소문자·기호 무시)", () => {
    const cards = [
      card("a", "# 회고\n오늘의 생각"),
      card("b", "**회고** 정리"),
      card("c", "잡담"),
      card("d", "> 주간 회고 노트"),
    ];
    const r = searchMemos(cards, "회고");
    expect(r.map((x) => x.id).sort()).toEqual(["a", "b", "d"]);
  });

  it("대소문자 무시 — 'HELLO' 검색이 'hello' 매칭", () => {
    const r = searchMemos([card("a", "Hello World")], "hello");
    expect(r.map((x) => x.id)).toEqual(["a"]);
    const r2 = searchMemos([card("a", "hello world")], "HELLO");
    expect(r2.map((x) => x.id)).toEqual(["a"]);
  });

  it("등장 횟수가 많을수록 score 높음 → 내림차순 정렬", () => {
    const cards = [
      card("once", "회고 한 번"),
      card("thrice", "회고 회고 회고"),
      card("twice", "회고 그리고 회고"),
    ];
    const r = searchMemos(cards, "회고");
    expect(r.map((x) => x.id)).toEqual(["thrice", "twice", "once"]);
    expect(r[0].score).toBe(3);
  });

  it("다중 토큰은 모두 포함해야 매칭(AND)", () => {
    const cards = [
      card("both", "주간 회고 노트"),
      card("one", "주간 일정"),
    ];
    const r = searchMemos(cards, "주간 회고");
    expect(r.map((x) => x.id)).toEqual(["both"]);
  });

  it("text 카드만 검색 대상 — image/board 등은 제외", () => {
    const cards = [
      card("text", "회고"),
      card("img", "회고", "image"),
      card("board", "회고", "board"),
    ];
    const r = searchMemos(cards, "회고");
    expect(r.map((x) => x.id)).toEqual(["text"]);
  });

  it("빈 query는 빈 결과(검색 비활성)", () => {
    const cards = [card("a", "회고")];
    expect(searchMemos(cards, "")).toEqual([]);
    expect(searchMemos(cards, "   ")).toEqual([]);
  });
});

describe("AC-4 — 수백 장 검색 성능(< 16ms)", () => {
  it("500장 검색이 16ms 미만", () => {
    const cards = Array.from({ length: 500 }, (_, i) =>
      card(`c${i}`, `메모 본문 ${i} ${i % 3 === 0 ? "회고" : "잡담"}`),
    );
    // 캐시 워밍업(첫 인덱싱) 후 측정 — 디바운스 입력당 비용.
    searchMemos(cards, "회고");
    const start = performance.now();
    const r = searchMemos(cards, "회고");
    const elapsed = performance.now() - start;
    expect(r.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(16);
  });
});
