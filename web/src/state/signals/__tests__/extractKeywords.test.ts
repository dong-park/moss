import { describe, test, expect } from "vitest";
import type { Note } from "@/state/db/schema";
import { extractKeywords } from "../extractKeywords";

function makeNote(content: string, id = String(Math.random())): Note {
  return {
    id,
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content,
    aiOptOut: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastVisitedAt: Date.now(),
  };
}

describe("extractKeywords", () => {
  test("빈 입력은 빈 배열", () => {
    expect(extractKeywords([])).toEqual([]);
  });

  test("본문이 빈 메모는 무시", () => {
    expect(extractKeywords([makeNote("")])).toEqual([]);
  });

  test("한국어 2글자 이상 어절 추출", () => {
    const result = extractKeywords([makeNote("신뢰는 안심에서 시작된다")]);
    const tokens = result.map((k) => k.token);
    expect(tokens).toContain("신뢰는");
    expect(tokens).toContain("안심에서");
    expect(tokens).toContain("시작된다");
  });

  test("영어 3글자 이상 단어 추출 (소문자 정규화)", () => {
    const result = extractKeywords([makeNote("Trust And Experience matter")]);
    const tokens = result.map((k) => k.token);
    expect(tokens).toContain("trust");
    expect(tokens).toContain("experience");
    expect(tokens).toContain("matter");
    // "And"(3글자)는 stop-word
    expect(tokens).not.toContain("and");
  });

  test("stop-words 제거 (한/영)", () => {
    const result = extractKeywords([
      makeNote("그리고 또는 the and matter trust"),
    ]);
    const tokens = result.map((k) => k.token);
    expect(tokens).not.toContain("그리고");
    expect(tokens).not.toContain("또는");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).toContain("matter");
    expect(tokens).toContain("trust");
  });

  test("동일 메모 내 중복 토큰은 1회만 카운트", () => {
    const result = extractKeywords([
      makeNote("신뢰 신뢰 신뢰 신뢰"),
      makeNote("신뢰"),
    ]);
    const trust = result.find((k) => k.token === "신뢰");
    expect(trust?.count).toBe(2);
  });

  test("빈도 내림차순 정렬, 동률은 사전순", () => {
    const result = extractKeywords([
      makeNote("alpha bravo charlie"),
      makeNote("alpha bravo"),
      makeNote("alpha"),
    ]);
    expect(result[0]).toEqual({ token: "alpha", count: 3 });
    expect(result[1]).toEqual({ token: "bravo", count: 2 });
    expect(result[2]).toEqual({ token: "charlie", count: 1 });
  });

  test("동률 토큰은 사전순", () => {
    const result = extractKeywords([
      makeNote("delta echo"),
      makeNote("echo delta"),
    ]);
    expect(result[0].token).toBe("delta");
    expect(result[1].token).toBe("echo");
  });

  test("상위 8개까지만 반환", () => {
    const notes = "abcdefghijkl".split("").map((c, i) =>
      makeNote(`word${c}`, String(i)),
    );
    const result = extractKeywords(notes);
    expect(result).toHaveLength(8);
  });

  test("한국어 1글자, 영어 2글자는 토큰화 제외", () => {
    const result = extractKeywords([makeNote("a b cc dd 아 이 가나")]);
    const tokens = result.map((k) => k.token);
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("cc");
    expect(tokens).not.toContain("아");
    expect(tokens).toContain("가나");
  });

  test("숫자만 토큰은 제외", () => {
    const result = extractKeywords([makeNote("2026 brand trust 안심")]);
    const tokens = result.map((k) => k.token);
    expect(tokens).not.toContain("2026");
    expect(tokens).toContain("brand");
    expect(tokens).toContain("trust");
    expect(tokens).toContain("안심");
  });
});
