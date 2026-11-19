import { afterEach, describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { useWorkspace } from "@/state/workspace";
import { frameNameOf, decodeFrameContent } from "@/state/frameContent";
import { renderCard } from "./setupCard";

/**
 * 메모판 이름표: 이름을 붙이지 않은 판은 이름표를 아예 그리지 않는다.
 * 이름은 카드 우클릭 "이름 변경"(renamingCardId 신호)으로 붙인다.
 */

const originalRenameFrame = useWorkspace.getState().renameFrame;

afterEach(() => {
  useWorkspace.setState({ renamingCardId: null, renameFrame: originalRenameFrame });
});

describe("FrameCardContent · 이름표", () => {
  it("이름이 없으면 이름표를 그리지 않는다", () => {
    const { container } = renderCard("frame", { content: JSON.stringify({ name: "" }) });
    expect(container.querySelector("[data-frame-name]")).toBeNull();
    expect(container.textContent).not.toContain("새 메모판");
  });

  it("예전 기본값 '새 메모판'으로 저장된 판도 이름 없음으로 본다", () => {
    const { container } = renderCard("frame", { content: JSON.stringify({ name: "새 메모판" }) });
    expect(container.querySelector("[data-frame-name]")).toBeNull();
  });

  it("이름이 있으면 이름표에 보여준다", () => {
    const { container } = renderCard("frame", { content: JSON.stringify({ name: "회의록" }) });
    expect(container.querySelector("[data-frame-name]")?.textContent).toBe("회의록");
  });

  it("이름 없는 판도 '이름 변경' 신호가 오면 빈 입력창이 뜨고 Enter로 저장한다", () => {
    const calls: Array<[string, string]> = [];
    useWorkspace.setState({
      renamingCardId: "c1",
      renameFrame: (id, name) => void calls.push([id, name]),
    });
    const { container } = renderCard("frame", { content: JSON.stringify({ name: "" }) });
    const input = container.querySelector<HTMLInputElement>("[data-frame-name-input]")!;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "회의록" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(calls).toEqual([["c1", "회의록"]]);
    expect(useWorkspace.getState().renamingCardId).toBeNull();
  });

  it("Esc면 저장하지 않고 닫는다", () => {
    const calls: unknown[] = [];
    useWorkspace.setState({ renamingCardId: "c1", renameFrame: () => void calls.push(1) });
    const { container } = renderCard("frame", { content: JSON.stringify({ name: "회의록" }) });
    const input = container.querySelector<HTMLInputElement>("[data-frame-name-input]")!;
    fireEvent.change(input, { target: { value: "버릴 이름" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(calls).toEqual([]);
    expect(useWorkspace.getState().renamingCardId).toBeNull();
  });
});

describe("frameContent 규약", () => {
  it("frameNameOf는 이름 없음을 빈 문자열로, decodeFrameContent는 기본 라벨로 준다", () => {
    const empty = JSON.stringify({ name: "" });
    expect(frameNameOf(empty)).toBe("");
    expect(decodeFrameContent(empty)).toBe("새 메모판");
    expect(frameNameOf("not json")).toBe("");
  });
});
