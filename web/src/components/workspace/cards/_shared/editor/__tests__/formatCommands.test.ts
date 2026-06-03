import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/prose/model";
import { EditorState, TextSelection } from "@milkdown/prose/state";

import { FORMAT_COMMANDS } from "../formatCommands";
import { memoBubbleItems } from "../BubbleToolbar";
import { t } from "@/i18n";

/* FEAT-memo-incard-format (W3) — 인카드 버블 서식 (AC-1·2·4·5).
 *
 * commonmark/gfm 스키마의 핵심 노드·마크 id(strong/emphasis/strike_through/
 * inlineCode, heading/bullet_list/ordered_list/list_item/blockquote)를 그대로 쓴
 * 대표 스키마 위에서 run/isActive를 검증한다 — FORMAT_COMMANDS가 실제
 * ProseMirror 커맨드를 올바른 타입에 적용하는지 본다. */

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
      defining: true,
      toDOM: (n) => [`h${n.attrs.level as number}`, 0],
    },
    blockquote: {
      group: "block",
      content: "block+",
      defining: true,
      toDOM: () => ["blockquote", 0],
    },
    bullet_list: {
      group: "block",
      content: "list_item+",
      toDOM: () => ["ul", 0],
    },
    ordered_list: {
      group: "block",
      content: "list_item+",
      toDOM: () => ["ol", 0],
    },
    list_item: {
      content: "paragraph block*",
      attrs: { checked: { default: null } },
      defining: true,
      toDOM: () => ["li", 0],
    },
    text: { group: "inline" },
  },
  marks: {
    strong: { toDOM: () => ["strong", 0] },
    emphasis: { toDOM: () => ["em", 0] },
    strike_through: { toDOM: () => ["del", 0] },
    inlineCode: { toDOM: () => ["code", 0] },
  },
});

// "hello"가 든 문단 한 개로 시작하고, 본문 전체를 선택한 상태를 만든다.
function makeState() {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("hello")]),
  ]);
  let state = EditorState.create({ schema, doc });
  const sel = TextSelection.create(state.doc, 1, 6); // "hello" 전체
  state = state.apply(state.tr.setSelection(sel));
  return state;
}

// run/isActive가 받는 EditorView를 흉내내는 최소 더블. dispatch는 상태를 갱신.
function makeView(initial = makeState()) {
  let state = initial;
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: ReturnType<EditorState["tr"]["setSelection"]>) {
      state = state.apply(tr);
    },
    focus() {},
  };
  return view as unknown as Parameters<
    (typeof FORMAT_COMMANDS)["bold"]["run"]
  >[0];
}

describe("memoBubbleItems (스펙 §2 · AC-5)", () => {
  it("스펙에 명시된 10개 서식을 명시 순서로 노출", () => {
    expect(memoBubbleItems.map((i) => i.id)).toEqual([
      "bold",
      "italic",
      "strike",
      "h1",
      "h2",
      "bullet",
      "ordered",
      "checklist",
      "quote",
      "code",
    ]);
    expect(memoBubbleItems.map((i) => i.label)).toEqual([
      "B",
      "I",
      "S",
      "H1",
      "H2",
      "•",
      "1.",
      "☑",
      "❝",
      "`",
    ]);
  });

  it("aria는 모달 툴바와 동일한 i18n 키를 재사용 (AC-5)", () => {
    const expected: Record<string, string> = {
      bold: t("workspace.memoEditor.toolbar.bold"),
      strike: t("workspace.memoEditor.toolbar.strike"),
      bullet: t("workspace.memoEditor.toolbar.bulletList"),
      checklist: t("workspace.memoEditor.toolbar.checklist"),
      code: t("workspace.memoEditor.toolbar.code"),
    };
    const byId = Object.fromEntries(memoBubbleItems.map((i) => [i.id, i.aria]));
    for (const [id, aria] of Object.entries(expected)) {
      expect(byId[id]).toBe(aria);
      expect(aria).not.toBe(""); // 키 누락이면 키 문자열이 그대로 — 비어있진 않음
    }
  });
});

describe("FORMAT_COMMANDS run/isActive (AC-2 · AC-4)", () => {
  it("bold: 선택에 strong 적용 + isActive 반영", () => {
    const view = makeView();
    expect(FORMAT_COMMANDS.bold.isActive(view)).toBe(false);
    FORMAT_COMMANDS.bold.run(view);
    expect(view.state.doc.rangeHasMark(1, 6, schema.marks.strong)).toBe(true);
    expect(FORMAT_COMMANDS.bold.isActive(view)).toBe(true);
  });

  it("italic/strike/code: 각자 자신의 마크만 토글", () => {
    for (const [id, mark] of [
      ["italic", "emphasis"],
      ["strike", "strike_through"],
      ["code", "inlineCode"],
    ] as const) {
      const view = makeView();
      FORMAT_COMMANDS[id].run(view);
      expect(view.state.doc.rangeHasMark(1, 6, schema.marks[mark])).toBe(true);
      expect(FORMAT_COMMANDS[id].isActive(view)).toBe(true);
    }
  });

  it("h1: 문단을 heading level 1로, 다시 누르면 문단으로 토글", () => {
    const view = makeView();
    expect(FORMAT_COMMANDS.h1.isActive(view)).toBe(false);
    FORMAT_COMMANDS.h1.run(view);
    expect(view.state.doc.firstChild?.type.name).toBe("heading");
    expect(view.state.doc.firstChild?.attrs.level).toBe(1);
    expect(FORMAT_COMMANDS.h1.isActive(view)).toBe(true);
    expect(FORMAT_COMMANDS.h2.isActive(view)).toBe(false); // 레벨 구분
    FORMAT_COMMANDS.h1.run(view);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("bullet: 글머리 목록으로 감싸고 isActive 반영", () => {
    const view = makeView();
    FORMAT_COMMANDS.bullet.run(view);
    expect(view.state.doc.firstChild?.type.name).toBe("bullet_list");
    expect(FORMAT_COMMANDS.bullet.isActive(view)).toBe(true);
  });

  it("checklist: list_item을 task(checked=false)로 만들고 isActive 반영", () => {
    const view = makeView();
    expect(FORMAT_COMMANDS.checklist.isActive(view)).toBe(false);
    FORMAT_COMMANDS.checklist.run(view);
    let sawTask = false;
    view.state.doc.descendants((node) => {
      if (node.type.name === "list_item") {
        expect(node.attrs.checked).toBe(false);
        sawTask = true;
      }
    });
    expect(sawTask).toBe(true);
    expect(FORMAT_COMMANDS.checklist.isActive(view)).toBe(true);
  });

  it("quote: blockquote로 감싸고 isActive 반영", () => {
    const view = makeView();
    FORMAT_COMMANDS.quote.run(view);
    expect(view.state.doc.firstChild?.type.name).toBe("blockquote");
    expect(FORMAT_COMMANDS.quote.isActive(view)).toBe(true);
  });
});
