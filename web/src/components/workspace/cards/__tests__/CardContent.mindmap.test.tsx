import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import {
  makeMindmapNodeId,
  parseMindmap,
  serializeMindmap,
  type MindmapNode,
} from "@/state/cardContent";
import { renderCard } from "./setupCard";

/** 자식 노드 input들만 반환 (root EditableLine은 button → input 전환이라 별도). */
function nodeInputs() {
  // 자식 노드는 모두 <input type="text"> + placeholder "…".
  // root EditableLine은 editing=true에서 <input>이지만 placeholder가 다르므로 구분.
  const all = screen.getAllByRole("textbox") as HTMLInputElement[];
  return all.filter((el) => el.placeholder === "…");
}

function makeMindmap(children: MindmapNode[]): string {
  return serializeMindmap({
    root: { id: "root", text: "", children },
  });
}

function makeNode(text: string, children: MindmapNode[] = []): MindmapNode {
  return { id: makeMindmapNodeId(), text, children };
}

describe("MindmapCardContent · 키보드 UX", () => {
  it("render — cards/v2/mindmap.png 표면이 적용된다", () => {
    const { container } = renderCard("mindmap", "");
    // cardSurface는 background-image에 PNG URL을 넣는다 (kind 직접 포함).
    const surface = container.querySelector("[style*=\"mindmap\"]") as HTMLElement | null;
    expect(surface).not.toBeNull();
    const bg = surface?.getAttribute("style") ?? "";
    expect(bg).toMatch(/mindmap/);
  });

  it("Enter → 같은 깊이의 새 노드를 afterId 다음 위치에 추가한다", () => {
    const a = makeNode("사과");
    const b = makeNode("바나나");
    const initial = makeMindmap([a, b]);
    const { onChange } = renderCard("mindmap", initial);

    fireEvent.keyDown(nodeInputs()[0], { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = parseMindmap(onChange.mock.calls[0][0]);
    const texts = next.root.children.map((c) => c.text);
    expect(texts).toEqual(["사과", "", "바나나"]);
  });

  it("Tab → 자기 이전 형제의 마지막 자식으로 이동, depth가 늘어난다", () => {
    const a = makeNode("부모");
    const b = makeNode("들여쓸 노드");
    const initial = makeMindmap([a, b]);
    const { onChange } = renderCard("mindmap", initial);

    fireEvent.keyDown(nodeInputs()[1], { key: "Tab" });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = parseMindmap(onChange.mock.calls[0][0]);
    // root.children에는 "부모"만, "들여쓸 노드"는 "부모"의 자식
    expect(next.root.children).toHaveLength(1);
    expect(next.root.children[0].text).toBe("부모");
    expect(next.root.children[0].children).toHaveLength(1);
    expect(next.root.children[0].children[0].text).toBe("들여쓸 노드");
  });

  it("↑/↓ — in-order 순회로 인접 노드 input에 포커스를 옮긴다", () => {
    // 트리: a, a 자식 c, b → in-order = [a, c, b]
    const c = makeNode("자식");
    const a = makeNode("a", [c]);
    const b = makeNode("b");
    const initial = makeMindmap([a, b]);
    const { rerenderWith } = renderCard("mindmap", initial);

    const firstInputs = nodeInputs();
    expect(firstInputs).toHaveLength(3);
    const [first, second, third] = firstInputs;

    act(() => first.focus());
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(document.activeElement).toBe(third);

    fireEvent.keyDown(third, { key: "ArrowUp" });
    expect(document.activeElement).toBe(second);

    // rerender 없이 동일 content에서 focus 이동만 검증 — focusedId state로 동작.
    rerenderWith({ content: initial });
  });

  it("빈 노드에서 Backspace → 노드 제거 + in-order 이전 노드 끝으로 포커스", () => {
    const a = makeNode("첫번째");
    const b = makeNode(""); // 빈 노드
    const initial = makeMindmap([a, b]);
    const { onChange, rerenderWith } = renderCard("mindmap", initial);

    const [, second] = nodeInputs();
    act(() => second.focus());
    fireEvent.keyDown(second, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = parseMindmap(onChange.mock.calls[0][0]);
    expect(next.root.children).toHaveLength(1);
    expect(next.root.children[0].text).toBe("첫번째");

    // 새 content로 rerender → 이전 노드(첫번째)에 포커스 이동 검증
    rerenderWith({
      content: onChange.mock.calls[0][0] as string,
      onCommit: vi.fn(),
    });
    expect(document.activeElement).toBe(nodeInputs()[0]);
  });

  it("Esc → onCommitEdit 호출 (input blur 경유)", () => {
    const a = makeNode("내용");
    const initial = makeMindmap([a]);
    const { onCommit } = renderCard("mindmap", initial);

    const [first] = nodeInputs();
    act(() => first.focus());
    // 초기 마운트에서 root EditableLine이 자동 focus → 자식 focus 전환 시 onCommit 1회.
    // Esc로 인한 commit만 분리 검증하려면 mock을 reset 후 keyDown.
    onCommit.mockClear();
    fireEvent.keyDown(first, { key: "Escape" });

    // Escape는 input.blur()를 호출 → onBlur=onCommit이 1회 트리거됨.
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
