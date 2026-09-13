import { describe, expect, it } from "vitest";
import {
  parseChecklist,
  serializeChecklist,
  parseHighlight,
  serializeHighlight,
  parseCode,
  serializeCode,
  parseLink,
  serializeLink,
  parseHandwriting,
  serializeHandwriting,
  parseMindmap,
  serializeMindmap,
  type ChecklistItem,
  type MindmapNode,
} from "@/state/cardContent";

describe("checklist 인코딩", () => {
  it("빈 본문 → 빈 배열", () => {
    expect(parseChecklist("")).toEqual([]);
  });

  it("잘못된 JSON → 빈 배열 (graceful)", () => {
    expect(parseChecklist("not json")).toEqual([]);
    expect(parseChecklist("{}")).toEqual([]);
  });

  it("round-trip: 항목 3개 (mixed done)", () => {
    const items: ChecklistItem[] = [
      { id: "a", text: "사기 전 확인", done: true },
      { id: "b", text: "장바구니 확인", done: false },
      { id: "c", text: "", done: false },
    ];
    const ser = serializeChecklist(items);
    expect(parseChecklist(ser)).toEqual(items);
  });

  it("필드 결손 fallback (id/text/done 누락)", () => {
    const broken = '[{"text":"x"}, {"done":true}, "garbage"]';
    const items = parseChecklist(broken);
    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("x");
    expect(items[0].done).toBe(false);
    expect(items[1].text).toBe("");
    expect(items[1].done).toBe(true);
    // id는 fallback으로 생성
    expect(typeof items[0].id).toBe("string");
  });
});

describe("highlight 인코딩", () => {
  it("빈 본문 → quote 공백", () => {
    expect(parseHighlight("")).toEqual({ quote: "" });
  });

  it("round-trip: quote + source", () => {
    const ser = serializeHighlight({ quote: "삶의 기쁨", source: "어느 책" });
    expect(parseHighlight(ser)).toEqual({ quote: "삶의 기쁨", source: "어느 책" });
  });

  it("source 없거나 공백이면 키 자체를 누락", () => {
    expect(serializeHighlight({ quote: "q" })).toBe('{"quote":"q"}');
    expect(serializeHighlight({ quote: "q", source: "  " })).toBe(
      '{"quote":"q"}',
    );
  });

  it("잘못된 JSON → 빈 quote", () => {
    expect(parseHighlight("nope")).toEqual({ quote: "" });
  });
});

describe("code 인코딩", () => {
  it("round-trip: code + lang", () => {
    const ser = serializeCode({ code: "const x = 1;\n", lang: "typescript" });
    expect(parseCode(ser)).toEqual({ code: "const x = 1;\n", lang: "typescript" });
  });

  it("lang 공백 → 키 누락", () => {
    expect(serializeCode({ code: "x", lang: "   " })).toBe('{"code":"x"}');
  });

  it("잘못된 JSON → 빈 code", () => {
    expect(parseCode("not json")).toEqual({ code: "" });
  });
});

describe("link 인코딩", () => {
  it("URL만 있는 경우 (preview fetch 전)", () => {
    const ser = serializeLink({ url: "https://example.com" });
    expect(parseLink(ser)).toEqual({ url: "https://example.com" });
  });

  it("preview 메타 포함 round-trip", () => {
    const link = {
      url: "https://example.com",
      title: "예시",
      summary: "요약문",
      thumbUrl: "https://example.com/og.png",
    };
    expect(parseLink(serializeLink(link))).toEqual(link);
  });

  it("구버전 포맷: raw URL string (JSON 아닌 본문)을 url로 인식", () => {
    expect(parseLink("https://raw.example/").url).toBe("https://raw.example/");
  });
});

describe("handwriting 인코딩", () => {
  it("빈 본문 → 빈 paths", () => {
    expect(parseHandwriting("")).toEqual({ paths: [] });
  });

  it("round-trip: 2개의 stroke (3 + 2 점)", () => {
    const data = {
      paths: [
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 },
        ],
        [
          { x: 7, y: 8 },
          { x: 9, y: 10 },
        ],
      ],
    };
    expect(parseHandwriting(serializeHandwriting(data))).toEqual(data);
  });

  it("잘못된 point 객체는 skip, 빈 path는 제외", () => {
    const broken =
      '{"paths":[[{"x":1,"y":2},{"x":"bad"},{"y":3}],[]]}';
    const r = parseHandwriting(broken);
    expect(r.paths).toEqual([[{ x: 1, y: 2 }]]);
  });
});

describe("mindmap 인코딩", () => {
  it("빈 본문 → root만 있는 기본 트리", () => {
    const r = parseMindmap("");
    expect(r.root.id).toBe("root");
    expect(r.root.text).toBe("");
    expect(r.root.children).toEqual([]);
  });

  it("round-trip: root + 자식 2개", () => {
    const data: MindmapNode = {
      id: "root",
      text: "프로젝트",
      children: [
        { id: "a", text: "기능 A", children: [] },
        { id: "b", text: "기능 B", children: [] },
      ],
    };
    expect(parseMindmap(serializeMindmap({ root: data }))).toEqual({
      root: data,
    });
  });

  it("필드 결손은 fallback (id 결손 → 자동 생성)", () => {
    const broken = '{"root":{"text":"x","children":[{"text":"c1"}]}}';
    const r = parseMindmap(broken);
    expect(r.root.text).toBe("x");
    expect(r.root.children).toHaveLength(1);
    expect(r.root.children[0].text).toBe("c1");
    expect(typeof r.root.children[0].id).toBe("string");
  });
});
