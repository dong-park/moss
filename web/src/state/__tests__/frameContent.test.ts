import { describe, expect, it } from "vitest";
import {
  decodeFrameConfig,
  decodeFrameContent,
  encodeFrameContent,
} from "@/state/frameContent";

const cols = (names: string[]) => names.map((name, i) => ({ id: `c${i}`, name }));

describe("encodeFrameContent / decodeFrameConfig", () => {
  it("문자열 이름을 넘기면 이름만 있는 옛 content로 인코딩한다(하위 호환)", () => {
    expect(JSON.parse(encodeFrameContent("  판  "))).toEqual({ name: "판" });
    expect(decodeFrameContent(encodeFrameContent("판"))).toBe("판");
  });

  it("이름이 비면 기본 이름으로 되돌린다", () => {
    expect(decodeFrameContent(encodeFrameContent({ name: "   " }))).toBe("새 메모판");
  });

  it("이름만 저장된 예전 판은 이름만 읽는다", () => {
    expect(decodeFrameConfig('{"name":"옛 판"}')).toEqual({ name: "옛 판" });
  });

  it("깨진 content는 기본 이름으로 읽는다", () => {
    expect(decodeFrameConfig("not json").name).toBe("새 메모판");
    expect(decodeFrameConfig("[]").name).toBe("새 메모판");
  });

  it("T6: 옛 세로 칸 content는 칸 없이 읽고, 다시 써도 skin·columns가 원본 그대로 남는다", () => {
    const legacy = JSON.stringify({
      name: "옛 판",
      skin: "columns",
      columns: cols(["씨앗", "", "묵힘"]),
    });
    expect(decodeFrameConfig(legacy)).toEqual({ name: "옛 판" });
    const back = JSON.parse(encodeFrameContent({ ...JSON.parse(legacy), name: "새 이름" }));
    expect(back).toEqual({ name: "새 이름", skin: "columns", columns: cols(["씨앗", "", "묵힘"]) });
  });

  it("깨진 columns도 고치지 않고 그대로 보존한다", () => {
    const content = encodeFrameContent({ name: "판", columns: [] });
    expect(JSON.parse(content).columns).toEqual([]);
  });

  it("FT-2: bg 크기는 양수일 때만 왕복하고, 아니면 없앤다", () => {
    const ok = encodeFrameContent({ name: "판", bg: { w: 800, h: 400 } });
    expect(decodeFrameConfig(ok).bg).toEqual({ w: 800, h: 400 });
    for (const bad of [{ w: 0, h: 10 }, { w: -1, h: 5 }, { w: 10, h: NaN }, { w: "1", h: 2 }, null]) {
      const content = encodeFrameContent({ name: "판", bg: bad as never });
      expect(JSON.parse(content)).not.toHaveProperty("bg");
      expect(decodeFrameConfig(JSON.stringify({ name: "판", bg: bad })).bg).toBeUndefined();
    }
  });
});
