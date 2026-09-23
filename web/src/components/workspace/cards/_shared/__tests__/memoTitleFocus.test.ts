import { describe, expect, it, vi } from "vitest";
import {
  focusMemoBodyStart,
  isFocusInSameCard,
  registerMemoBodyFocus,
} from "../memoTitleFocus";

/* FEAT-memo-title-front-edit f2·f4 — 카드 스코프 blur 가드·본문 포커스 레지스트리. */
describe("isFocusInSameCard — blur 가드 판정 (AC-3)", () => {
  function card(id: string) {
    const el = document.createElement("div");
    el.setAttribute("data-card-id", id);
    return el;
  }

  it("같은 카드 안 대상이면 true", () => {
    const c = card("c1");
    const input = document.createElement("input");
    c.appendChild(input);
    expect(isFocusInSameCard(input, "c1")).toBe(true);
  });

  it("다른 카드 안 대상이면 false", () => {
    const other = card("c2");
    const input = document.createElement("input");
    other.appendChild(input);
    expect(isFocusInSameCard(input, "c1")).toBe(false);
  });

  it("body로 portal된 버블 툴바면 true", () => {
    const bar = document.createElement("div");
    bar.setAttribute("data-bubble-toolbar", "");
    const btn = document.createElement("button");
    bar.appendChild(btn);
    expect(isFocusInSameCard(btn, "c1")).toBe(true);
  });

  it("포커스 소실(null)이면 false", () => {
    expect(isFocusInSameCard(null, "c1")).toBe(false);
  });

  it("Node가 아닌 이벤트 객체면 false", () => {
    expect(isFocusInSameCard({} as EventTarget, "c1")).toBe(false);
  });
});

describe("본문 포커스 레지스트리 (AC-5)", () => {
  it("등록한 카드 id로 본문 포커스를 부른다", () => {
    const focus = vi.fn();
    registerMemoBodyFocus("c1", focus);
    expect(focusMemoBodyStart("c1")).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    registerMemoBodyFocus("c1", null);
  });

  it("등록이 없으면 false", () => {
    expect(focusMemoBodyStart("없는카드")).toBe(false);
  });
});
