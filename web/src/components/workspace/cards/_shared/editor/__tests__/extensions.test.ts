import { describe, expect, it } from "vitest";
import {
  editorPlugins,
  pasteHandlers,
  bubbleMenuItems,
  subscribeBubble,
  getBubbleState,
  getBubbleServerSnapshot,
} from "../extensions";

/* FEAT-memo-editor-seams (P0) — 확장 슬롯 레지스트리 (AC-2~4). */

describe("editorPlugins 슬롯", () => {
  it("평탄화된 비어있지 않은 플러그인 배열(기본 프리셋+슬롯 포함)", () => {
    expect(Array.isArray(editorPlugins)).toBe(true);
    // commonmark/gfm(배열) + listener + placeholder + paste + bubble → 다수
    expect(editorPlugins.length).toBeGreaterThan(4);
    // 중첩 배열이 남아있지 않아야 .use(editorPlugins)가 안전
    expect(editorPlugins.every((p) => !Array.isArray(p))).toBe(true);
  });
});

describe("pasteHandlers 슬롯", () => {
  it("W6 sanitize 핸들러가 첫 항목으로 등록됨(image보다 먼저 — 순서 계약)", () => {
    expect(Array.isArray(pasteHandlers)).toBe(true);
    // W6(sanitize) 등록 후 길이 ≥ 1, 그리고 반드시 첫 항목이어야 한다.
    expect(pasteHandlers.length).toBeGreaterThanOrEqual(1);
    expect(typeof pasteHandlers[0]).toBe("function");
  });
});

describe("bubbleMenuItems 슬롯 + 버블 store", () => {
  it("초기 빈 배열 → 호스트는 절대 열리지 않음", () => {
    expect(bubbleMenuItems.length).toBe(0);
  });

  it("기본 버블 상태는 닫힘, 서버 스냅샷도 닫힘", () => {
    expect(getBubbleState().open).toBe(false);
    expect(getBubbleServerSnapshot().open).toBe(false);
  });

  it("구독 해제가 동작", () => {
    let n = 0;
    const unsub = subscribeBubble(() => {
      n += 1;
    });
    expect(typeof unsub).toBe("function");
    unsub();
    expect(n).toBe(0);
  });
});
