import { describe, expect, it } from "vitest";
import type { Card } from "@/state/workspace";
import {
  parseWikilinkToken,
  resolveWikilinkTarget,
  extractWikilinkTokens,
  backlinksOf,
  cardTitle,
  findActiveQuery,
  isMemoCard,
  wikilink,
} from "../wikilink";

/* FEAT-memo-wikilinks (W5) — 순수 셀렉터/파서 단위 테스트 (AC-1·3·4·5). */

function card(id: string, content: string, kind: Card["kind"] = "text"): Card {
  return { id, kind, x: 0, y: 0, width: 200, content };
}

describe("cardTitle", () => {
  it("첫 비공백 줄에서 머리기호·강조를 벗긴다", () => {
    expect(cardTitle(card("a", "# 회고\n본문"))).toBe("회고");
    expect(cardTitle(card("b", "\n\n  **중요** 메모  "))).toBe("중요 메모");
    expect(cardTitle(card("c", ""))).toBe("");
  });
});

describe("parseWikilinkToken", () => {
  it("id|표시명 → id 토큰", () => {
    expect(parseWikilinkToken("c-1|회고")).toEqual({ id: "c-1", label: "회고" });
  });
  it("제목만 → 제목 토큰", () => {
    expect(parseWikilinkToken(" 회고 ")).toEqual({ title: "회고" });
  });
});

describe("extractWikilinkTokens", () => {
  it("닫힌 위키링크만 여러 개 추출(미닫힘·줄바꿈 제외)", () => {
    const tokens = extractWikilinkTokens("앞 [[c-1|회고]] 중간 [[기획]] 끝 [[열림");
    expect(tokens).toEqual([{ id: "c-1", label: "회고" }, { title: "기획" }]);
  });
});

describe("resolveWikilinkTarget", () => {
  const cards = [card("c-1", "# 회고"), card("c-2", "기획 메모"), card("c-9", "회고", "code")];
  it("id 토큰은 id로 해소(종류 무관)", () => {
    expect(resolveWikilinkTarget({ id: "c-2", label: "x" }, cards)?.id).toBe("c-2");
    expect(resolveWikilinkTarget({ id: "none", label: "x" }, cards)).toBeNull();
  });
  it("제목 토큰은 글 카드 제목(대소문자 무시)으로 해소", () => {
    expect(resolveWikilinkTarget({ title: "회고" }, cards)?.id).toBe("c-1");
    // code 카드(c-9)는 제목 일치해도 대상 아님
    expect(resolveWikilinkTarget({ title: "없는제목" }, cards)).toBeNull();
  });
});

describe("backlinksOf (AC-4·AC-5)", () => {
  it("id 링크는 대상 제목이 바뀌어도 역참조가 유지된다", () => {
    const target = card("c-1", "# 새이름"); // 원래 제목과 무관
    const ref = card("c-2", "여기 [[c-1|옛이름]] 참조");
    const other = card("c-3", "무관");
    expect(backlinksOf([target, ref, other], "c-1").map((c) => c.id)).toEqual([
      "c-2",
    ]);
  });
  it("제목 링크는 현재 제목으로 매칭", () => {
    const target = card("c-1", "# 회고");
    const ref = card("c-2", "[[회고]] 본다");
    expect(backlinksOf([target, ref], "c-1").map((c) => c.id)).toEqual(["c-2"]);
  });
  it("자기 자신·없는 대상은 제외", () => {
    const target = card("c-1", "[[c-1|자기]]");
    expect(backlinksOf([target], "c-1")).toEqual([]);
    expect(backlinksOf([target], "ghost")).toEqual([]);
  });
});

describe("findActiveQuery (AC-1 트리거)", () => {
  it("닫히지 않은 [[질의 를 잡는다", () => {
    expect(findActiveQuery("메모 [[회")).toBe("회");
    expect(findActiveQuery("[[")).toBe("");
  });
  it("닫힌 링크·트리거 없음은 null", () => {
    expect(findActiveQuery("[[회고]] 끝")).toBeNull();
    expect(findActiveQuery("그냥 텍스트")).toBeNull();
  });
});

describe("isMemoCard / 플러그인 export", () => {
  it("글 카드만 메모 대상", () => {
    expect(isMemoCard(card("a", "x"))).toBe(true);
    expect(isMemoCard(card("b", "x", "code"))).toBe(false);
  });
  it("wikilink는 비어있지 않은 MilkdownPlugin 배열", () => {
    expect(Array.isArray(wikilink)).toBe(true);
    expect(wikilink.length).toBeGreaterThan(0);
  });
});
