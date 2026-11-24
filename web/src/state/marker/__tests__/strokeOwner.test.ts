/**
 * wall-marker 리뷰 W9 — "이 획은 누구 것인가" 판정을 한 곳에서. 시작점이 주인이다(D4=A):
 * 포스트잇 위면 그 포스트잇, 그 밖(빈 벽·메모판·글상자·사진…)이면 벽, 캔버스 UI 위면 아무도 아니다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "@/state/workspace";
import { strokeOwnerOf, strokeOwnerOfCard } from "@/state/marker/strokeOwner";

let host: HTMLElement;
let world: HTMLElement;

function el(parent: Element, attrs: Record<string, string> = {}, tag = "div"): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

beforeEach(() => {
  host = el(document.body);
  world = el(host, { "data-canvas-world": "true" });
  useWorkspace.setState({
    cards: [
      { id: "memo", kind: "text", x: 0, y: 0, width: 240, content: "" },
      { id: "box", kind: "textbox", x: 0, y: 0, width: 240, content: "" },
      { id: "frame", kind: "frame", x: 0, y: 0, width: 400, content: "" },
    ],
  });
});

afterEach(() => {
  host.remove();
  useWorkspace.setState({ cards: [] });
});

describe("strokeOwnerOfCard", () => {
  it("포스트잇(text)만 자기 획을 갖는다", () => {
    expect(strokeOwnerOfCard({ id: "m", kind: "text" })).toEqual({ kind: "sticky", cardId: "m" });
    expect(strokeOwnerOfCard({ id: "b", kind: "textbox" })).toEqual({ kind: "wall" });
    expect(strokeOwnerOfCard({ id: "f", kind: "frame" })).toEqual({ kind: "wall" });
    expect(strokeOwnerOfCard({ id: "p", kind: "photo" })).toEqual({ kind: "wall" });
  });
});

describe("strokeOwnerOf(target)", () => {
  it("캔버스 바탕(host) 자체와 월드 안 빈 곳은 벽이다", () => {
    expect(strokeOwnerOf(host, host)).toEqual({ kind: "wall" });
    expect(strokeOwnerOf(world, host)).toEqual({ kind: "wall" });
  });

  it("포스트잇 위(그 안쪽 자식 포함)는 그 포스트잇이다", () => {
    const card = el(world, { "data-card-id": "memo" });
    const inner = el(card);
    expect(strokeOwnerOf(card, host)).toEqual({ kind: "sticky", cardId: "memo" });
    expect(strokeOwnerOf(inner, host)).toEqual({ kind: "sticky", cardId: "memo" });
  });

  it("글상자·메모판 위는 벽이다(D12=A: 포스트잇이 아닌 곳에서 시작한 획은 벽 획)", () => {
    expect(strokeOwnerOf(el(world, { "data-card-id": "box" }), host)).toEqual({ kind: "wall" });
    expect(strokeOwnerOf(el(world, { "data-card-id": "frame" }), host)).toEqual({ kind: "wall" });
  });

  it("월드 밖 캔버스 UI(줌 막대·휴지통 등)와 모르는 대상은 아무도 아니다", () => {
    const ui = el(host, { "data-zoom-bar": "true" });
    expect(strokeOwnerOf(ui, host)).toEqual({ kind: "none" });
    expect(strokeOwnerOf(null, host)).toEqual({ kind: "none" });
    expect(strokeOwnerOf(window, host)).toEqual({ kind: "none" });
  });

  it("스토어에 없는 카드 요소는 벽으로 본다(이미 지워진 카드 위에서 시작)", () => {
    expect(strokeOwnerOf(el(world, { "data-card-id": "gone" }), host)).toEqual({ kind: "wall" });
  });
});
