import { describe, expect, it } from "vitest";
import { blocksToMarkdown, serializeBlocks } from "@/state/cardContent";

/** FEAT-card-allinone §5 — 직렬화 형태 보장(검색·AI 회귀 방지). */
describe("올인원 블록 직렬화", () => {
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

  it("빈 블록 배열은 빈 문자열로 직렬화", () => {
    expect(serializeBlocks([])).toBe("");
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
