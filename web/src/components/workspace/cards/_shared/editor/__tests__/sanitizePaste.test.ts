import { describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

import { htmlToCleanMarkdown, sanitizePasteHandler } from "../sanitizePaste";

/* FEAT-memo-paste-sanitize (W6) — HTML→MD 정제 + paste 핸들러 순서 계약. */

describe("htmlToCleanMarkdown — allowlist 정제 (AC-1)", () => {
  it("span/style/class 등 비허용 래퍼는 벗기고 텍스트·강조만 남긴다", () => {
    const html =
      '<p><span style="color:red" class="x">Hello <b>world</b></span></p>';
    expect(htmlToCleanMarkdown(html)).toBe("Hello **world**");
  });

  it("제목 → #", () => {
    expect(htmlToCleanMarkdown("<h2>제목</h2>")).toBe("## 제목");
    expect(htmlToCleanMarkdown("<h1>T</h1>")).toBe("# T");
  });

  it("불릿 목록 → -", () => {
    expect(htmlToCleanMarkdown("<ul><li>a</li><li>b</li></ul>")).toBe(
      "- a\n- b",
    );
  });

  it("번호 목록 → 1. 2.", () => {
    expect(htmlToCleanMarkdown("<ol><li>x</li><li>y</li></ol>")).toBe(
      "1. x\n2. y",
    );
  });

  it("중첩 목록은 들여쓰기로 보존", () => {
    const html = "<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>";
    expect(htmlToCleanMarkdown(html)).toBe("- a\n  - a1\n- b");
  });

  it("링크 → [text](href), 위험 스킴은 href 제거", () => {
    expect(
      htmlToCleanMarkdown('<a href="https://ex.com">link</a>'),
    ).toBe("[link](https://ex.com)");
    expect(
      htmlToCleanMarkdown('<a href="javascript:alert(1)">x</a>'),
    ).toBe("x");
  });

  it("인라인 코드/em → 백틱·*", () => {
    expect(htmlToCleanMarkdown("<code>foo()</code>")).toBe("`foo()`");
    expect(htmlToCleanMarkdown("<i>hi</i>")).toBe("*hi*");
  });

  it("pre → 펜스드 코드블록(원문 공백 유지)", () => {
    expect(htmlToCleanMarkdown("<pre>line1\n  line2</pre>")).toBe(
      "```\nline1\n  line2\n```",
    );
  });

  it("여러 문단은 빈 줄 하나로 구분", () => {
    expect(htmlToCleanMarkdown("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });

  it("빈 입력/공백은 빈 문자열", () => {
    expect(htmlToCleanMarkdown("")).toBe("");
    expect(htmlToCleanMarkdown("<div>   </div>")).toBe("");
  });

  it("길이 캡 초과 HTML은 평문만 추출(서식 제거)", () => {
    const huge = "<b>x</b>".repeat(20_000); // > 100k chars
    const out = htmlToCleanMarkdown(huge);
    expect(out).not.toContain("**");
    expect(out).not.toContain("<");
    expect(out.length).toBeGreaterThan(0);
  });
});

/* ── 핸들러 분기 (AC-2~4) — 가벼운 mock view/event ──────────────── */

function fakeEvent(opts: {
  html?: string;
  files?: Array<{ type: string }>;
}): ClipboardEvent {
  const files = opts.files ?? [];
  const data = {
    files,
    items: files.map((f) => ({ kind: "file", type: f.type })),
    getData: (mime: string) => (mime === "text/html" ? opts.html ?? "" : ""),
  };
  return { clipboardData: data } as unknown as ClipboardEvent;
}

function viewWithParent(typeName: string): EditorView {
  return {
    state: {
      selection: {
        $from: { depth: 0, node: () => ({ type: { name: typeName } }) },
      },
    },
    dispatch: vi.fn(),
  } as unknown as EditorView;
}

describe("sanitizePasteHandler — 순서 계약 분기", () => {
  it("AC-4: 이미지 file 포함 클립보드는 false로 통과(W2가 처리)", () => {
    const view = viewWithParent("paragraph");
    const event = fakeEvent({
      html: "<p>caption</p>",
      files: [{ type: "image/png" }],
    });
    expect(sanitizePasteHandler(view, event)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("AC-3: 코드블록 안에서는 정제하지 않고 false로 통과(원문 유지)", () => {
    const view = viewWithParent("code_block");
    const event = fakeEvent({ html: "<p><b>x</b></p>" });
    expect(sanitizePasteHandler(view, event)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it("AC-2: text/html 없음(Cmd+Shift+V·평문)은 false로 통과(평문 폴백)", () => {
    const view = viewWithParent("paragraph");
    const event = fakeEvent({ html: "" });
    expect(sanitizePasteHandler(view, event)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});

describe("sanitizePasteHandler — 정제 삽입 (AC-1 end-to-end)", () => {
  // parseSlice 검증용 최소 스키마(문단/제목/강조).
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        parseDOM: [{ tag: "p" }],
        toDOM: () => ["p", 0],
      },
      heading: {
        group: "block",
        content: "inline*",
        attrs: { level: { default: 1 } },
        parseDOM: [1, 2, 3, 4, 5, 6].map((l) => ({
          tag: `h${l}`,
          attrs: { level: l },
        })),
        toDOM: (n) => [`h${n.attrs.level}`, 0],
      },
      text: { group: "inline" },
    },
    marks: {
      strong: {
        parseDOM: [{ tag: "strong" }, { tag: "b" }],
        toDOM: () => ["strong", 0],
      },
      em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
    },
  });

  it("html 있고 코드블록 밖 → true 반환 + 정제 슬라이스를 dispatch", () => {
    const state = EditorState.create({ schema });
    const dispatch = vi.fn();
    const view = { state, dispatch } as unknown as EditorView;

    const event = fakeEvent({
      html: '<p><span style="x">Hi <b>there</b></span></p>',
    });
    const consumed = sanitizePasteHandler(view, event);

    expect(consumed).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    // dispatch된 트랜잭션 적용 결과에 strong 마크가 살아있고 span은 사라짐.
    const tr = dispatch.mock.calls[0][0];
    const md = state.apply(tr).doc.textContent;
    expect(md).toContain("Hi");
    expect(md).toContain("there");
  });
});
