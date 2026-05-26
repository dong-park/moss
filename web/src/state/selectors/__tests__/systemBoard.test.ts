import { describe, expect, it } from "vitest";
import { computeNowStayingCards } from "@/state/selectors/systemBoard";
import type { Card } from "@/state/workspace";

function card(over: Partial<Card>): Card {
  return {
    id: "c1",
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    content: "",
    lastVisitedAt: 0,
    ...over,
  };
}

describe("computeNowStayingCards", () => {
  it("lastVisitedAt이 없거나 본문이 빈 카드는 후보에서 제외", () => {
    const result = computeNowStayingCards([
      card({ id: "a", content: "유효", lastVisitedAt: 100 }),
      card({ id: "b", content: "", lastVisitedAt: 200 }), // 빈 본문
      card({ id: "c", content: "메타만", lastVisitedAt: undefined }), // 시각 없음
    ]);
    expect(result.map((r) => r.theme)).toEqual(["유효"]);
  });

  it("같은 첫 어절을 가진 카드는 하나의 theme으로 묶인다", () => {
    const result = computeNowStayingCards([
      card({ id: "a", content: "첫구매 전환", lastVisitedAt: 300 }),
      card({ id: "b", content: "첫구매 분석", lastVisitedAt: 200 }),
      card({ id: "c", content: "다른 주제", lastVisitedAt: 100 }),
    ]);
    expect(result).toHaveLength(2);
    const firstPurchase = result.find((r) => r.theme.startsWith("첫구매"));
    expect(firstPurchase?.visitCount).toBe(2);
    expect(firstPurchase?.noteIds).toEqual(["a", "b"]);
  });

  it("그룹 정렬은 그룹 내 최신 lastVisitedAt 기준", () => {
    const result = computeNowStayingCards([
      card({ id: "a", content: "오래된 주제", lastVisitedAt: 100 }),
      card({ id: "b", content: "최신 주제", lastVisitedAt: 500 }),
      card({ id: "c", content: "중간 주제", lastVisitedAt: 300 }),
    ]);
    expect(result.map((r) => r.theme)).toEqual([
      "최신 주제",
      "중간 주제",
      "오래된 주제",
    ]);
  });

  it("maxThemes 옵션으로 결과 크기를 제한", () => {
    const cards: Card[] = Array.from({ length: 10 }, (_, i) =>
      card({
        id: `c-${i}`,
        content: `주제${i}`,
        lastVisitedAt: 1000 - i,
      }),
    );
    const result = computeNowStayingCards(cards, { maxThemes: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].theme).toBe("주제0");
  });

  it("topN으로 후보 풀을 제한 — topN 밖의 카드는 그룹화되지 않는다", () => {
    const result = computeNowStayingCards(
      [
        card({ id: "a", content: "주제 같음", lastVisitedAt: 500 }),
        card({ id: "b", content: "주제 같음", lastVisitedAt: 100 }), // topN=1이면 제외
      ],
      { topN: 1 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].visitCount).toBe(1);
  });

  it("30자 초과 첫 줄은 라벨이 잘려서 ellipsis", () => {
    const long = "가".repeat(40);
    const result = computeNowStayingCards([
      card({ id: "a", content: long, lastVisitedAt: 100 }),
    ]);
    expect(result[0].theme.length).toBeLessThanOrEqual(31); // 30 + "…"
    expect(result[0].theme.endsWith("…")).toBe(true);
  });

  it("noteIds는 lastVisitedAt 내림차순", () => {
    const result = computeNowStayingCards([
      card({ id: "old", content: "회귀 주제", lastVisitedAt: 100 }),
      card({ id: "new", content: "회귀 주제", lastVisitedAt: 300 }),
      card({ id: "mid", content: "회귀 주제", lastVisitedAt: 200 }),
    ]);
    expect(result[0].noteIds).toEqual(["new", "mid", "old"]);
  });
});
