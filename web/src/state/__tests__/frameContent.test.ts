import { describe, expect, it } from "vitest";
import {
  decodeFrameConfig,
  decodeFrameContent,
  encodeFrameContent,
  normalizeFrameColumns,
  type FrameColumn,
} from "@/state/frameContent";

const cols = (names: string[]): FrameColumn[] =>
  names.map((name, i) => ({ id: `c${i}`, name }));

describe("encodeFrameContent / decodeFrameConfig", () => {
  it("문자열 이름을 넘기면 이름만 있는 옛 content로 인코딩한다(하위 호환)", () => {
    expect(JSON.parse(encodeFrameContent("  판  "))).toEqual({ name: "판" });
    expect(decodeFrameContent(encodeFrameContent("판"))).toBe("판");
  });

  it("이름이 비면 기본 이름으로 되돌린다", () => {
    expect(decodeFrameContent(encodeFrameContent({ name: "   " }))).toBe("새 메모판");
  });

  it("AC-1: 이름만 저장된 예전 판은 자유 판 + 기본 3칸으로 읽는다", () => {
    const cfg = decodeFrameConfig('{"name":"옛 판"}');
    expect(cfg.name).toBe("옛 판");
    expect(cfg.skin).toBe("free");
    expect(cfg.columns.map((c) => c.name)).toEqual(["씨앗", "자라는 중", "묵힘"]);
  });

  it("AC-2: 모르는 스킨은 자유 판으로 읽는다", () => {
    expect(decodeFrameConfig('{"name":"x","skin":"calendar"}').skin).toBe("free");
    expect(decodeFrameConfig("not json").skin).toBe("free");
    expect(decodeFrameConfig("[]").skin).toBe("free");
  });

  it("AC-2: 깨진 칸 목록은 기본 3칸으로 읽는다", () => {
    expect(decodeFrameConfig('{"columns":"nope"}').columns).toHaveLength(3);
    expect(decodeFrameConfig('{"columns":[{"id":"a","name":"하나"}]}').columns).toHaveLength(3);
    expect(decodeFrameConfig('{"columns":[1,2,3]}').columns).toHaveLength(3);
  });

  it("칸 목록은 최대 8개로 자른다", () => {
    const many = new Array(12).fill(null).map((_, i) => ({ id: `c${i}`, name: `${i}` }));
    expect(decodeFrameConfig(JSON.stringify({ columns: many })).columns).toHaveLength(8);
  });

  it("칸 이름은 trim 후 20자로 자르고 빈 이름을 허용한다", () => {
    const [a, b] = normalizeFrameColumns([
      { id: "a", name: "  " + "가".repeat(30) + "  " },
      { id: "b", name: "" },
    ]);
    expect(a.name).toHaveLength(20);
    expect(a.name.startsWith("가")).toBe(true);
    expect(b.name).toBe("");
  });

  it("AC-3·AC-12: 스킨이 free여도 칸 목록을 지우지 않고 왕복한다", () => {
    const content = encodeFrameContent({ name: "판", skin: "free", columns: cols(["씨앗", "묵힘"]) });
    expect(JSON.parse(content)).toEqual({
      name: "판",
      skin: "free",
      columns: cols(["씨앗", "묵힘"]),
    });
    const back = decodeFrameConfig(content);
    expect(back.skin).toBe("free");
    expect(back.columns.map((c) => c.name)).toEqual(["씨앗", "묵힘"]);
  });

  it("AC-2: 깨진 칸 목록은 인코딩 때도 기본 3칸으로 정규화한다", () => {
    const content = encodeFrameContent({ name: "판", columns: [] });
    expect(decodeFrameConfig(content).columns).toHaveLength(3);
  });
});
