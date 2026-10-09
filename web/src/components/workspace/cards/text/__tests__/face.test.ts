import { describe, expect, it } from "vitest";
import { serializeBlock } from "@/state/blocks";
import { memoFace } from "../face";

describe("memoFace", () => {
  it("링크 블록 한 줄이면 link 앞면", () => {
    const md = serializeBlock({ type: "link", url: "https://www.notion.so/x", title: "회고 템플릿" })!;
    expect(memoFace(md)).toEqual({ t: "link", url: "https://www.notion.so/x", title: "회고 템플릿", site: "notion.so" });
  });

  it("모든 줄이 체크박스면 todo 앞면", () => {
    const f = memoFace("- [x] 여권\n- [ ] 우산");
    expect(f).toEqual({
      t: "todo",
      items: [
        { text: "여권", done: true, line: 0 },
        { text: "우산", done: false, line: 1 },
      ],
    });
  });

  it("글이 섞이거나 비어 있으면 paper", () => {
    expect(memoFace("").t).toBe("paper");
    expect(memoFace("장보기\n- [ ] 우유").t).toBe("paper");
    expect(memoFace("https://a.com 참고").t).toBe("paper");
  });

});
