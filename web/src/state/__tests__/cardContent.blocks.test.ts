import { describe, expect, it } from "vitest";
import {
  blocksToMarkdown,
  makeBlock,
  parseBlocks,
  serializeBlocks,
  type CardBlock,
} from "@/state/cardContent";

/** FEAT-card-allinone §5 — 블록 직렬화/파싱 + graceful default + 마이그레이션 호환. */
describe("올인원 블록 인코딩", () => {
  it("round-trip — text/code/handwriting 혼합 보존", () => {
    const blocks: CardBlock[] = [
      { type: "text", text: "오늘 메모" },
      { type: "code", code: "const x = 1", lang: "ts" },
      { type: "handwriting", paths: [[{ x: 0, y: 0 }, { x: 5, y: 5 }]] },
    ];
    expect(parseBlocks(serializeBlocks(blocks))).toEqual(blocks);
  });

  it("빈 문자열 → 빈 배열 (AC-5: UI에서 빈 text 블록으로 표현)", () => {
    expect(parseBlocks("")).toEqual([]);
  });

  it("단일 text 블록은 plain string으로 직렬화 (AI/검색 회귀 방지)", () => {
    // 블록 JSON이 아니라 레거시 글 카드와 동일한 평문이어야 한다.
    expect(serializeBlocks([{ type: "text", text: "오늘 메모" }])).toBe("오늘 메모");
    // 멀티 블록·code/handwriting 포함 시에만 JSON 배열.
    expect(serializeBlocks([{ type: "code", code: "x" }]).startsWith("[")).toBe(true);
    expect(
      serializeBlocks([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]).startsWith("["),
    ).toBe(true);
  });

  it("plain text → 단일 text 블록 (레거시 글 카드)", () => {
    expect(parseBlocks("오늘 메모")).toEqual([{ type: "text", text: "오늘 메모" }]);
  });

  it("JSON object 문자열 → 원문을 text 블록으로 보존", () => {
    expect(parseBlocks('{"foo":1}')).toEqual([{ type: "text", text: '{"foo":1}' }]);
  });

  it("배열이지만 블록이 없는 평문 '[1,2,3]' → 데이터 손실 없이 text 블록", () => {
    expect(parseBlocks("[1,2,3]")).toEqual([{ type: "text", text: "[1,2,3]" }]);
  });

  it("알 수 없는 type 블록은 스킵, 유효 블록만 유지", () => {
    const content = JSON.stringify([
      { type: "text", text: "a" },
      { type: "weird", foo: 1 },
      { type: "code", code: "b" },
    ]);
    expect(parseBlocks(content)).toEqual([
      { type: "text", text: "a" },
      { type: "code", code: "b" },
    ]);
  });

  it("code 블록 lang 없으면 lang 키 생략", () => {
    const blocks: CardBlock[] = [{ type: "code", code: "x" }];
    const parsed = parseBlocks(serializeBlocks(blocks));
    expect(parsed).toEqual([{ type: "code", code: "x" }]);
    expect((parsed[0] as { lang?: string }).lang).toBeUndefined();
  });

  it("handwriting 블록의 잘못된 점·빈 path는 정제", () => {
    const content = JSON.stringify([
      {
        type: "handwriting",
        paths: [
          [{ x: 1, y: 2 }, { x: "bad", y: 3 }],
          [],
          [{ x: 4, y: 5 }, { x: 6, y: 7 }],
        ],
      },
    ]);
    expect(parseBlocks(content)).toEqual([
      {
        type: "handwriting",
        paths: [[{ x: 1, y: 2 }], [{ x: 4, y: 5 }, { x: 6, y: 7 }]],
      },
    ]);
  });

  it("makeBlock — 종류별 빈 블록", () => {
    expect(makeBlock("text")).toEqual({ type: "text", text: "" });
    expect(makeBlock("code")).toEqual({ type: "code", code: "" });
    expect(makeBlock("handwriting")).toEqual({ type: "handwriting", paths: [] });
  });
});

/* ─── Dexie v3 — CardBlock[] JSON → markdown 마이그레이션 ───
 * 카드와 모달이 같은 Milkdown 렌더러로 통일되며, content가 markdown 문자열로 의미
 * 변경된다. 기존 JSON 카드는 upgrade()에서 blocksToMarkdown으로 변환된다. */
describe("blocksToMarkdown — JSON → markdown 마이그레이션", () => {
  it("빈 문자열은 그대로", () => {
    expect(blocksToMarkdown("")).toBe("");
  });

  it("JSON이 아닌 평문(이미 markdown)은 그대로 반환", () => {
    expect(blocksToMarkdown("이미 markdown 문자열")).toBe("이미 markdown 문자열");
    expect(blocksToMarkdown("# 제목\n본문")).toBe("# 제목\n본문");
  });

  it("text 블록만 있는 JSON은 본문 텍스트만 추출", () => {
    const json = JSON.stringify([{ type: "text", text: "안녕\n둘째 줄" }]);
    expect(blocksToMarkdown(json)).toBe("안녕\n둘째 줄");
  });

  it("code 블록은 fenced code block(```lang)으로 변환", () => {
    const json = JSON.stringify([{ type: "code", code: "const x = 1", lang: "ts" }]);
    expect(blocksToMarkdown(json)).toBe("```ts\nconst x = 1\n```");
  });

  it("lang 미지정 code 블록은 ``` (언어 없음)", () => {
    const json = JSON.stringify([{ type: "code", code: "x = 1" }]);
    expect(blocksToMarkdown(json)).toBe("```\nx = 1\n```");
  });

  it("멀티 블록(text + code)은 빈 줄로 단락 구분", () => {
    const json = JSON.stringify([
      { type: "text", text: "메모" },
      { type: "code", code: "x = 1", lang: "py" },
    ]);
    expect(blocksToMarkdown(json)).toBe("메모\n\n```py\nx = 1\n```");
  });

  it("handwriting 블록은 폐기(펜 overlay로 대체)", () => {
    const json = JSON.stringify([
      { type: "text", text: "위" },
      { type: "handwriting", paths: [[{ x: 0, y: 0 }]] },
      { type: "text", text: "아래" },
    ]);
    expect(blocksToMarkdown(json)).toBe("위\n\n아래");
  });

  it("배열은 맞지만 인식 가능한 블록 0개면 원문 보존(손실 방지)", () => {
    const json = JSON.stringify([{ type: "unknown" }, "not an object"]);
    expect(blocksToMarkdown(json)).toBe(json);
  });
});
