import { describe, expect, it } from "vitest";
import {
  codeToMarkdown,
  checklistToMarkdown,
  highlightToMarkdown,
  migratedContent,
  isMigratedKind,
} from "@/state/markdownMigration";
import {
  serializeChecklist,
  serializeCode,
  serializeHighlight,
} from "@/state/cardContent";

describe("codeToMarkdown", () => {
  it("lang 있는 코드 → 펜스 코드블록", () => {
    const md = codeToMarkdown(serializeCode({ code: "const x = 1", lang: "js" }));
    expect(md).toBe("```js\nconst x = 1\n```");
  });

  it("lang 없으면 펜스 뒤 비움", () => {
    const md = codeToMarkdown(serializeCode({ code: "plain" }));
    expect(md).toBe("```\nplain\n```");
  });

  it("본문에 백틱 런이 있으면 더 긴 펜스로 감싼다", () => {
    const md = codeToMarkdown(serializeCode({ code: "a ``` b" }));
    expect(md.startsWith("````")).toBe(true);
    expect(md.endsWith("````")).toBe(true);
    expect(md).toContain("a ``` b");
  });

  it("빈/잘못된 본문 → 빈 코드블록 (graceful)", () => {
    expect(codeToMarkdown("")).toBe("```\n\n```");
    expect(codeToMarkdown("not json")).toBe("```\n\n```");
  });
});

describe("checklistToMarkdown", () => {
  it("mixed done → GFM 작업목록", () => {
    const md = checklistToMarkdown(
      serializeChecklist([
        { id: "1", text: "우유 사기", done: false },
        { id: "2", text: "메일 회신", done: true },
      ]),
    );
    expect(md).toBe("- [ ] 우유 사기\n- [x] 메일 회신");
  });

  it("빈 목록 → 빈 문자열", () => {
    expect(checklistToMarkdown(serializeChecklist([]))).toBe("");
  });
});

describe("highlightToMarkdown", () => {
  it("source 없으면 인용 한 줄", () => {
    const md = highlightToMarkdown(serializeHighlight({ quote: "인용된 한 줄" }));
    expect(md).toBe("> 인용된 한 줄");
  });

  it("source 있으면 별도 인용 라인", () => {
    const md = highlightToMarkdown(
      serializeHighlight({ quote: "인용", source: "출처" }),
    );
    expect(md).toBe("> 인용\n>\n> — 출처");
  });

  it("여러 줄 인용 → 각 줄 인용 접두", () => {
    const md = highlightToMarkdown(serializeHighlight({ quote: "a\nb" }));
    expect(md).toBe("> a\n> b");
  });
});

describe("migratedContent / isMigratedKind", () => {
  it("대상 kind만 변환, 그 외는 null", () => {
    expect(migratedContent("code", serializeCode({ code: "x" }))).not.toBeNull();
    expect(migratedContent("checklist", serializeChecklist([]))).not.toBeNull();
    expect(
      migratedContent("highlight", serializeHighlight({ quote: "q" })),
    ).not.toBeNull();
    expect(migratedContent("text", "그냥 텍스트")).toBeNull();
    expect(migratedContent("comment", "{...}")).toBeNull();
    expect(migratedContent("mindmap", "{}")).toBeNull();
  });

  it("isMigratedKind", () => {
    expect(isMigratedKind("code")).toBe(true);
    expect(isMigratedKind("checklist")).toBe(true);
    expect(isMigratedKind("highlight")).toBe(true);
    expect(isMigratedKind("text")).toBe(false);
    expect(isMigratedKind("mindmap")).toBe(false);
  });
});
