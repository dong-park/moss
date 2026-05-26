import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate, isTemplateId } from "@/templates";
import { createT, messagesByLocale } from "@/i18n";

const t = createT(messagesByLocale.ko);

describe("TEMPLATES", () => {
  it("5종 정의되어 있고 id 유일", () => {
    expect(TEMPLATES).toHaveLength(5);
    const ids = TEMPLATES.map((tpl) => tpl.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual(["free", "mindmap", "project", "research", "diary"]);
  });

  it("free는 initialCards가 빈 배열", () => {
    const free = getTemplate("free")!;
    expect(free.buildInitialCards(t)).toHaveLength(0);
  });

  it("mindmap/project/research/diary는 1개 이상 카드 생성", () => {
    for (const id of ["mindmap", "project", "research", "diary"] as const) {
      const tpl = getTemplate(id)!;
      expect(tpl.buildInitialCards(t).length).toBeGreaterThan(0);
    }
  });

  it("nameKey/descriptionKey는 모두 i18n에서 resolve 가능", () => {
    for (const tpl of TEMPLATES) {
      const name = t(tpl.nameKey);
      const desc = t(tpl.descriptionKey);
      expect(name).not.toBe(tpl.nameKey);
      expect(desc).not.toBe(tpl.descriptionKey);
    }
  });

  it("diary는 오늘 날짜를 본문에 포함 (factory injection)", () => {
    const diary = getTemplate("diary")!;
    const fixed = new Date(2026, 4, 21);
    const cards = diary.buildInitialCards(t, fixed);
    const dateCard = cards.find((c) => /2026/.test(c.content));
    expect(dateCard).toBeDefined();
    expect(dateCard!.content).toContain("2026년");
    expect(dateCard!.content).toContain("5월");
    expect(dateCard!.content).toContain("21일");
  });

  it("initialCards 좌표·폭은 양수", () => {
    for (const tpl of TEMPLATES) {
      for (const card of tpl.buildInitialCards(t)) {
        expect(card.width).toBeGreaterThan(0);
        expect(Number.isFinite(card.x)).toBe(true);
        expect(Number.isFinite(card.y)).toBe(true);
      }
    }
  });

  it("isTemplateId 가드", () => {
    expect(isTemplateId("free")).toBe(true);
    expect(isTemplateId("nope")).toBe(false);
  });
});
