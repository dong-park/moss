import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import {
  PLACEHOLDER_CLASS,
  placeholderDecorations,
} from "@/components/workspace/cards/_shared/markdownPlaceholder";

/* FEAT-memo-learnability — 빈 메모 placeholder 데코레이션.
 * Milkdown은 jsdom에서 불안정해(CardContent.text.test 참고) 에디터 전체 대신
 * placeholder 결정 로직만 ProseMirror 최소 스키마로 결정적으로 검증한다.
 * AC-1(빈 메모 → 힌트), AC-2(내용 있음 → 미표시)를 그대로 매핑. */

// commonmark의 doc/paragraph/text 구조를 흉내 낸 최소 스키마.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
    text: {},
  },
});

function stateFor(text: string): EditorState {
  const para =
    text.length === 0
      ? schema.node("paragraph")
      : schema.node("paragraph", null, [schema.text(text)]);
  return EditorState.create({ doc: schema.node("doc", null, [para]) });
}

const HINT = "# 제목 · - [ ] 할일";

describe("placeholderDecorations · 빈 메모 학습성", () => {
  it("AC-1 — 빈 doc이면 placeholder 데코레이션을 만든다", () => {
    const set = placeholderDecorations(stateFor(""), HINT);
    expect(set).not.toBeNull();
    const decos = set!.find();
    expect(decos).toHaveLength(1);
    // 노드 데코레이션 spec에 class + data-placeholder(힌트 문자열)가 실린다.
    const spec = (decos[0] as unknown as { type: { attrs: Record<string, string> } })
      .type.attrs;
    expect(spec.class).toBe(PLACEHOLDER_CLASS);
    expect(spec["data-placeholder"]).toBe(HINT);
  });

  it("AC-2 — 내용이 있으면 데코레이션이 없다(비파괴)", () => {
    expect(placeholderDecorations(stateFor("이미 쓴 메모"), HINT)).toBeNull();
  });

  it("입력 시작(한 글자)만으로도 placeholder가 사라진다", () => {
    expect(placeholderDecorations(stateFor("ㄱ"), HINT)).toBeNull();
  });
});
