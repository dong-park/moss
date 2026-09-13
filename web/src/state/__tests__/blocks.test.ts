import { describe, expect, it } from "vitest";
import {
  countBlocks,
  firstBlockIsImage,
  parseBlock,
  serializeBlock,
  type Block,
} from "@/state/blocks";

describe("blocks — 왕복(serialize ∘ parse)", () => {
  it("이미지 블록: parseBlock(serializeBlock(b)) → 왕복 + 문자열 왕복", () => {
    const s = serializeBlock({ type: "image", ref: "opfs:abc.png" });
    expect(s).toBe("![](opfs://abc.png)");
    const parsed = parseBlock(s);
    expect(parsed).toEqual({ type: "image", ref: "opfs:abc.png" });
    expect(serializeBlock(parsed as Block)).toBe(s);
  });

  it("링크 블록: 제목 있음", () => {
    const s = serializeBlock({
      type: "link",
      url: "https://example.com",
      title: "예시",
    });
    expect(s).toBe('[예시](https://example.com "moss-link")');
    const parsed = parseBlock(s);
    expect(parsed).toEqual({
      type: "link",
      url: "https://example.com",
      title: "예시",
    });
    expect(serializeBlock(parsed as Block)).toBe(s);
  });

  it("링크 블록: 제목 비면 URL을 제목으로(spec §4)", () => {
    const s = serializeBlock({ type: "link", url: "https://example.com" });
    expect(s).toBe('[https://example.com](https://example.com "moss-link")');
    const parsed = parseBlock(s) as Extract<Block, { type: "link" }>;
    expect(parsed.type).toBe("link");
    expect(parsed.title).toBe("https://example.com");
    // 문자열 왕복은 유지된다(블록 값 자체의 왕복은 보장 대상이 아님).
    expect(serializeBlock(parsed)).toBe(s);
  });

  it("녹음 블록: 왕복", () => {
    const s = serializeBlock({ type: "audio", ref: "opfs:rec1.webm" });
    expect(s).toBe('[녹음](opfs://rec1.webm "moss-audio")');
    const parsed = parseBlock(s);
    expect(parsed).toEqual({ type: "audio", ref: "opfs:rec1.webm" });
    expect(serializeBlock(parsed as Block)).toBe(s);
  });

  it("파일 블록: 왕복", () => {
    const s = serializeBlock({
      type: "file",
      ref: "opfs:doc1.pdf",
      filename: "보고서.pdf",
    });
    expect(s).toBe('[보고서.pdf](opfs://doc1.pdf "moss-file")');
    const parsed = parseBlock(s);
    expect(parsed).toEqual({
      type: "file",
      ref: "opfs:doc1.pdf",
      filename: "보고서.pdf",
    });
    expect(serializeBlock(parsed as Block)).toBe(s);
  });
});

describe("blocks — 특수문자 이스케이프", () => {
  it("파일명의 ']', '\"', '\\\\'를 이스케이프하고 왕복한다", () => {
    const filename = 'weird]name"with\\backslash.txt';
    const s = serializeBlock({ type: "file", ref: "opfs:x.bin", filename });
    const parsed = parseBlock(s);
    expect(parsed).toEqual({ type: "file", ref: "opfs:x.bin", filename });
    expect(serializeBlock(parsed as Block)).toBe(s);
  });

  it("링크 제목의 특수문자도 왕복한다", () => {
    const title = '제목 [대괄호] "따옴표"';
    const s = serializeBlock({ type: "link", url: "https://a.b/c", title });
    const parsed = parseBlock(s);
    expect(parsed).toEqual({ type: "link", url: "https://a.b/c", title });
    expect(serializeBlock(parsed as Block)).toBe(s);
  });
});

describe("blocks — 문단 단독 조건", () => {
  it("문장 안에 섞인 moss-link 모양은 블록이 아니다(null)", () => {
    const line = '문장 시작 [예시](https://example.com "moss-link") 문장 끝';
    expect(parseBlock(line)).toBeNull();
  });

  it("일반 텍스트는 null", () => {
    expect(parseBlock("그냥 본문 문장입니다.")).toBeNull();
    expect(parseBlock("")).toBeNull();
    expect(parseBlock("   ")).toBeNull();
  });

  it("일반 마크다운 링크(모조 표식 없음)는 블록이 아니다", () => {
    expect(parseBlock("[그냥 링크](https://example.com)")).toBeNull();
  });
});

describe("countBlocks", () => {
  it("네 블록이 섞인 본문에서 종류별 개수를 센다", () => {
    const markdown = [
      "제목 문단",
      "![](opfs://img1.png)",
      "",
      '[녹음](opfs://rec1.webm "moss-audio")',
      '[녹음](opfs://rec2.webm "moss-audio")',
      '[예시](https://example.com "moss-link")',
      "본문 중간에 섞인 링크 " +
        '[예시](https://example.com "moss-link") 는 세지 않는다',
    ].join("\n");

    expect(countBlocks(markdown)).toEqual({
      image: 1,
      link: 1,
      audio: 2,
      file: 0,
    });
  });

  it("빈 문자열은 전부 0", () => {
    expect(countBlocks("")).toEqual({ image: 0, link: 0, audio: 0, file: 0 });
  });
});

describe("firstBlockIsImage", () => {
  it("첫 비어있지 않은 문단이 이미지 블록이면 true", () => {
    const markdown = ["", "![](opfs://img1.png)", '[녹음](opfs://r.webm "moss-audio")'].join(
      "\n",
    );
    expect(firstBlockIsImage(markdown)).toBe(true);
  });

  it("첫 문단이 일반 텍스트면 false", () => {
    const markdown = ["첫 줄 텍스트", "![](opfs://img1.png)"].join("\n");
    expect(firstBlockIsImage(markdown)).toBe(false);
  });

  it("첫 문단이 이미지 아닌 다른 블록이면 false", () => {
    const markdown = ['[녹음](opfs://r.webm "moss-audio")', "![](opfs://img1.png)"].join(
      "\n",
    );
    expect(firstBlockIsImage(markdown)).toBe(false);
  });

  it("빈 본문은 false", () => {
    expect(firstBlockIsImage("")).toBe(false);
  });
});

describe("실경로: imagePaste.ts 스킴 변환 재사용", () => {
  it("opfs: vs opfs:// 스킴 차이가 serializeBlock/parseBlock 왕복에서 보존된다", () => {
    // 저장 참조(opfs:)로 만든 블록이 마크다운 URL(opfs://)로 직렬화되고,
    // 다시 파싱하면 저장 참조로 되돌아온다(imagePaste.ts의 toStorageRef/toMarkdownUrl).
    const ref = "opfs:some-id.bin";
    const s = serializeBlock({ type: "audio", ref });
    expect(s).toContain("opfs://some-id.bin");
    expect(s).not.toContain("opfs:some-id.bin ");
    const parsed = parseBlock(s);
    expect(parsed).toEqual({ type: "audio", ref });
  });
});
