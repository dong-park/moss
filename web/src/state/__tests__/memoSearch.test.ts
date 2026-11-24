import { beforeEach, describe, expect, it } from "vitest";
import {
  chosungOf,
  matchText,
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

  it("textbox도 검색 대상 — 원문 그대로 매칭(마크다운 벗기기 없음) (P2-3)", () => {
    expect(
      searchMemos([card("tb", "구역 회고", "textbox")], "회고").map((x) => x.id),
    ).toEqual(["tb"]);
    // plainText를 썼다면 '*'가 지워져 "ab"가 되어 매칭되지 않는다.
    expect(
      searchMemos([card("tb", "a*b", "textbox")], "a*b").map((x) => x.id),
    ).toEqual(["tb"]);
  });

  it("빈 query는 빈 결과(검색 비활성)", () => {
    const cards = [card("a", "회고")];
    expect(searchMemos(cards, "")).toEqual([]);
    expect(searchMemos(cards, "   ")).toEqual([]);
  });
});

describe("FEAT-memo-title AC-8 — 제목 검색", () => {
  it("본문에 없는 말이 제목에만 있어도 매칭된다", () => {
    const cards = [
      card("a", "회의록 내용입니다", "text"),
      { ...card("b", "완전히 다른 본문"), title: "주간 회고" },
    ] satisfies Card[];
    const hits = searchMemos(cards, "회고");
    expect(hits.map((h) => h.id)).toEqual(["b"]);
  });

  it("제목만 있는(본문 빈) 메모도 매칭된다", () => {
    const cards = [{ ...card("a", ""), title: "주간 회고" }] satisfies Card[];
    expect(searchMemos(cards, "주간")).toHaveLength(1);
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

describe("FEAT-photo-card — 사진 캡션 검색", () => {
  function photo(id: string, caption: string): Card {
    return {
      id,
      kind: "photo",
      x: 0,
      y: 0,
      width: 240,
      height: 180,
      content: caption,
      attachmentRef: "opfs:x.png",
    };
  }

  it("캡션 '제주 바다'는 '제주'로 찾힌다", () => {
    const hits = searchMemos([photo("p", "제주 바다")], "제주");
    expect(hits.map((h) => h.id)).toEqual(["p"]);
  });

  it("캡션 없는 사진은 검색에 오르지 않는다", () => {
    const hits = searchMemos([photo("p", "")], "제주");
    expect(hits).toHaveLength(0);
  });
});

/** 칠할 구간을 글에서 잘라 읽는다. */
function painted(text: string, ranges: readonly (readonly [number, number])[]): string[] {
  return ranges.map(([a, b]) => text.slice(a, b));
}

describe("chosungOf — 음절 → 초성 (T14)", () => {
  it("음절은 초성으로, 그 밖의 글자는 그대로", () => {
    expect(chosungOf("이직 고민 중")).toBe("ㅇㅈ ㄱㅁ ㅈ");
    expect(chosungOf("까치 Hello 12!")).toBe("ㄲㅊ Hello 12!");
    expect(chosungOf("ㅋㅋ")).toBe("ㅋㅋ");
  });

  it("경계 음절 '가'·'힣'과 겹받침 음절", () => {
    expect(chosungOf("가힣")).toBe("ㄱㅎ");
    expect(chosungOf("닭값")).toBe("ㄷㄱ");
  });

  it("글자 수가 보존된다", () => {
    const s = "겹받침 닭 읊다 Aa1";
    expect(chosungOf(s)).toHaveLength(s.length);
  });
});

describe("matchText — 초성·혼합·부분 매칭 (T2·T3·T14)", () => {
  it("'ㅇㅈ'이 이직·연주·인재를 맞추고 그 구간을 칠한다 (T2)", () => {
    const cases: [string, string][] = [
      ["이직 고민 중", "이직"],
      ["연주회 표 예매", "연주"],
      ["인재 채용 캡처", "인재"],
    ];
    for (const [text, expected] of cases) {
      const m = matchText("ㅇㅈ", text);
      expect(m, text).not.toBeNull();
      expect(painted(text, m!.ranges)).toEqual([expected]);
    }
  });

  it("초성이 이어지지 않는 글은 맞지 않는다", () => {
    expect(matchText("ㅇㅈ", "오늘 점심")).toBeNull();
    expect(matchText("ㅇㅈ", "이 집")).toBeNull();
  });

  it("완성 글자와 초성을 섞는다 — '연ㅈ' (T3)", () => {
    const text = "연주회 표 예매";
    const m = matchText("연ㅈ", text)!;
    expect(painted(text, m.ranges)).toEqual(["연주"]);
  });

  it("글자 일부 — '고민' (T3)", () => {
    const text = "이직 고민 중";
    const m = matchText("고민", text)!;
    expect(painted(text, m.ranges)).toEqual(["고민"]);
    expect(m.count).toBe(1);
  });

  it("마지막 글자가 받침 없는 음절이면 받침 있는 음절과도 맞는다 — '이지'는 '이직' (D3)", () => {
    const text = "이직 고민";
    const m = matchText("이지", text)!;
    expect(painted(text, m.ranges)).toEqual(["이직"]);
  });

  it("D3는 마지막 글자에만 — '지이'는 '직이'와 맞지 않는다", () => {
    expect(matchText("지이", "직이")).toBeNull();
    expect(matchText("지이", "지이")).not.toBeNull();
  });

  it("받침 있는 마지막 글자는 풀리지 않는다 — '이직'은 '이지'와 맞지 않는다", () => {
    expect(matchText("이직", "이지")).toBeNull();
    expect(matchText("이직", "이집")).toBeNull();
  });

  it("여러 낱말이면 마지막 낱말의 마지막 글자에만 D3를 적용한다", () => {
    expect(matchText("이지 고민", "이직 고민")).toBeNull();
    expect(matchText("고민 이지", "이직 고민")).not.toBeNull();
  });

  it("'ㄲ'은 '까치'와 맞고 '가지'와 맞지 않는다", () => {
    expect(matchText("ㄲ", "까치")).not.toBeNull();
    expect(matchText("ㄲ", "가지")).toBeNull();
    expect(matchText("ㄱ", "까치")).toBeNull();
    expect(matchText("ㄱ", "가지")).not.toBeNull();
  });

  it("글에 적힌 자모 자체도 맞는다", () => {
    expect(matchText("ㅋ", "ㅋㅋㅋ 웃김")!.count).toBe(3);
  });

  it("영문은 대소문자를 가리지 않고 칠할 구간은 원문 위치다", () => {
    const text = "Meeting NOTES";
    const m = matchText("notes", text)!;
    expect(painted(text, m.ranges)).toEqual(["NOTES"]);
    expect(matchText("MEETING", text)).not.toBeNull();
  });

  it("숫자·기호는 글자 그대로 맞춘다", () => {
    const text = "3월 14일 회의 (A-2)";
    expect(painted(text, matchText("14", text)!.ranges)).toEqual(["14"]);
    expect(painted(text, matchText("(a-2)", text)!.ranges)).toEqual(["(A-2)"]);
    expect(matchText("15", text)).toBeNull();
  });

  it("숫자 섞인 글에서 초성도 맞는다", () => {
    const text = "2025 이직 준비 3단계";
    expect(painted(text, matchText("ㅇㅈ", text)!.ranges)).toEqual(["이직"]);
    expect(painted(text, matchText("ㅈㅂ", text)!.ranges)).toEqual(["준비"]);
  });

  it("빈 검색어·공백뿐인 검색어는 결과 0", () => {
    expect(matchText("", "이직")).toBeNull();
    expect(matchText("   ", "이직")).toBeNull();
  });

  it("낱말은 모두 맞아야 하고 횟수는 합이다", () => {
    const text = "이직 고민 이직 준비";
    expect(matchText("ㅇㅈ ㄱㅁ", text)!.count).toBe(3);
    expect(matchText("ㅇㅈ 휴가", text)).toBeNull();
  });

  it("겹치는 구간은 합쳐서 돌려준다", () => {
    const text = "이직고민";
    const m = matchText("이직 직고", text)!;
    expect(m.ranges).toEqual([[0, 3]]);
  });

  it("구간은 시작 순이다", () => {
    const text = "ㄱ 가나 다가";
    const m = matchText("가 ㄱ", text)!;
    const starts = m.ranges.map((r) => r[0]);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("searchMemos — 초성·구간 (T2·T3)", () => {
  it("초성 검색이 text 카드 본문을 찾고 평문 위 구간을 준다", () => {
    const cards = [card("a", "# 이직 고민 중"), card("b", "잡담")];
    const hits = searchMemos(cards, "ㅇㅈ");
    expect(hits.map((h) => h.id)).toEqual(["a"]);
    // "# 이직 고민 중" → plainTextRaw "이직 고민 중"
    expect(painted("이직 고민 중", hits[0].bodyRanges)).toEqual(["이직"]);
    expect(hits[0].titleRanges).toEqual([]);
  });

  it("제목에서 맞으면 titleRanges로, 대소문자를 가린다", () => {
    const cards = [{ ...card("a", "본문"), title: "Weekly 회고" }] satisfies Card[];
    const hits = searchMemos(cards, "weekly");
    expect(hits).toHaveLength(1);
    expect(painted("Weekly 회고", hits[0].titleRanges)).toEqual(["Weekly"]);
    expect(hits[0].bodyRanges).toEqual([]);
  });

  it("낱말이 제목과 본문에 나뉘어 있어도 모두 맞으면 든다", () => {
    const cards = [{ ...card("a", "이직 준비"), title: "주간 회고" }] satisfies Card[];
    const hits = searchMemos(cards, "ㅈㄱ ㅇㅈ");
    expect(hits.map((h) => h.id)).toEqual(["a"]);
    expect(hits[0].score).toBe(2);
  });

  it("textbox·photo 캡션도 초성으로 찾는다", () => {
    const cards: Card[] = [
      card("tb", "연주회 일정", "textbox"),
      {
        id: "p",
        kind: "photo",
        x: 0,
        y: 0,
        width: 240,
        height: 180,
        content: "제주 바다",
        attachmentRef: "opfs:x.png",
      },
    ];
    expect(searchMemos(cards, "ㅇㅈ").map((h) => h.id)).toEqual(["tb"]);
    expect(searchMemos(cards, "ㅈㅈ").map((h) => h.id)).toEqual(["p"]);
  });

  it("편집으로 내용이 바뀌면 캐시가 따라 바뀐다", () => {
    expect(searchMemos([card("a", "이직")], "ㅇㅈ")).toHaveLength(1);
    expect(searchMemos([card("a", "점심")], "ㅇㅈ")).toHaveLength(0);
  });
});

describe("T13 — 2,000장 초성 검색 성능(< 16ms)", () => {
  it("2,000장 초성 검색이 16ms 미만", () => {
    const cards = Array.from({ length: 2000 }, (_, i) =>
      card(`c${i}`, `메모 본문 ${i} ${i % 3 === 0 ? "이직 고민" : "잡담 정리"} 오늘 할 일`),
    );
    searchMemos(cards, "ㅇㅈ");
    const start = performance.now();
    const r = searchMemos(cards, "ㅇㅈ");
    const elapsed = performance.now() - start;
    expect(r.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(16);
  });
});
