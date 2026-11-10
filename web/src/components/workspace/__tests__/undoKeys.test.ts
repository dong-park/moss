/**
 * cmd-z-undo n3 — cmd+z 키 경로 판정(순수 함수).
 * 펜 모드 → 펜 기록, 편집·펼친 창·입력칸 → 기본 동작(none), 그 밖 → 보드 기록.
 */
import { describe, expect, it } from "vitest";
import {
  decideUndoKey,
  isTypingTarget,
  type UndoKeyEvent,
  type UndoKeyState,
} from "@/components/workspace/undoKeys";

const base: UndoKeyState = { penMode: false, editingId: null, expandedCardId: null, typing: false };

function ev(o: Partial<UndoKeyEvent> = {}): UndoKeyEvent {
  return { key: "z", code: "KeyZ", metaKey: true, ctrlKey: false, shiftKey: false, ...o };
}

describe("decideUndoKey", () => {
  it("캔버스: cmd+z는 되돌리기, cmd+shift+z는 다시 실행", () => {
    expect(decideUndoKey(ev(), base)).toBe("canvas-undo");
    expect(decideUndoKey(ev({ shiftKey: true, key: "Z" }), base)).toBe("canvas-redo");
  });

  it("ctrl도 cmd와 같다", () => {
    expect(decideUndoKey(ev({ metaKey: false, ctrlKey: true }), base)).toBe("canvas-undo");
    expect(decideUndoKey(ev({ metaKey: false, ctrlKey: true, shiftKey: true }), base)).toBe(
      "canvas-redo",
    );
  });

  it("한글 입력기: e.key 'ㅋ'이어도 e.code 'KeyZ'면 받는다", () => {
    expect(decideUndoKey(ev({ key: "ㅋ" }), base)).toBe("canvas-undo");
    expect(decideUndoKey(ev({ key: "ㅋ", shiftKey: true }), base)).toBe("canvas-redo");
    expect(decideUndoKey(ev({ key: "ㅋ" }), { ...base, penMode: true })).toBe("pen-undo");
  });

  it("e.code가 달라도 e.key가 z면 받는다", () => {
    expect(decideUndoKey(ev({ code: "KeyY" }), base)).toBe("canvas-undo");
  });

  it("수식 키 없이 z, 다른 글자는 none", () => {
    expect(decideUndoKey(ev({ metaKey: false }), base)).toBe("none");
    expect(decideUndoKey(ev({ key: "x", code: "KeyX" }), base)).toBe("none");
  });

  it("펜 모드: 펜 되돌리기·다시 실행 — 입력칸 포커스·편집 상태보다 우선한다", () => {
    const pen = { ...base, penMode: true };
    expect(decideUndoKey(ev(), pen)).toBe("pen-undo");
    expect(decideUndoKey(ev({ shiftKey: true }), pen)).toBe("pen-redo");
    expect(decideUndoKey(ev(), { ...pen, typing: true })).toBe("pen-undo");
  });

  it("T7: 입력칸 포커스, 카드 편집 중, 펼친 메모 창이면 none", () => {
    expect(decideUndoKey(ev(), { ...base, typing: true })).toBe("none");
    expect(decideUndoKey(ev(), { ...base, editingId: "c1" })).toBe("none");
    expect(decideUndoKey(ev(), { ...base, expandedCardId: "c1" })).toBe("none");
    expect(decideUndoKey(ev({ shiftKey: true }), { ...base, expandedCardId: "c1" })).toBe("none");
  });
});

describe("isTypingTarget", () => {
  it("input·textarea·contenteditable은 입력칸이다", () => {
    const input = document.createElement("input");
    const ta = document.createElement("textarea");
    const ce = document.createElement("div");
    ce.setAttribute("contenteditable", "true");
    const div = document.createElement("div");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(ta)).toBe(true);
    expect(isTypingTarget(ce)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
