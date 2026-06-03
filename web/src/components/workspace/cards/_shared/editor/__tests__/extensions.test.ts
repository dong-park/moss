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
  it("초기 빈 배열(워커가 등록) — 빈 상태에서 기본 붙여넣기 통과", () => {
    expect(Array.isArray(pasteHandlers)).toBe(true);
    expect(pasteHandlers.length).toBe(0);
  });
});

describe("bubbleMenuItems 슬롯 + 버블 store", () => {
  it("W3 등록 후 항목 보유 → 선택 시 호스트 노출 (id/label/run 구비)", () => {
    // P0 머지 시점엔 빈 배열이었고, W3(FEAT-memo-incard-format)가 등록한다.
    expect(bubbleMenuItems.length).toBeGreaterThan(0);
    for (const item of bubbleMenuItems) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.label).toBe("string");
      expect(typeof item.run).toBe("function");
    }
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
