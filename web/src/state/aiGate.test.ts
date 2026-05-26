import { describe, test, expect } from "vitest";
import { canSendToAI, filterNotesForAI } from "./aiGate";

/**
 * FEAT-privacy DOD: canSendToAI 진리표
 *
 * global × note × board 3변수 8조합. true=차단, false=허용.
 * 우선순위는 global > note > board (어느 하나라도 true면 차단).
 */
const cases: Array<{
  global: boolean;
  note: boolean;
  board: boolean;
  expected: boolean;
}> = [
  { global: false, note: false, board: false, expected: true },
  { global: false, note: false, board: true, expected: false },
  { global: false, note: true, board: false, expected: false },
  { global: false, note: true, board: true, expected: false },
  { global: true, note: false, board: false, expected: false },
  { global: true, note: false, board: true, expected: false },
  { global: true, note: true, board: false, expected: false },
  { global: true, note: true, board: true, expected: false },
];

describe("canSendToAI 진리표 (global × note × board)", () => {
  for (const c of cases) {
    test(`global=${c.global} note=${c.note} board=${c.board} → ${c.expected}`, () => {
      expect(
        canSendToAI({
          globalOptOut: c.global,
          noteOptOut: c.note,
          boardOptOut: c.board,
        }),
      ).toBe(c.expected);
    });
  }
});

describe("filterNotesForAI", () => {
  test("globalOptOut=true는 모든 메모를 차단", () => {
    const notes = [
      { id: "a", title: "A", aiOptOut: false },
      { id: "b", title: "B", aiOptOut: false },
    ];
    const r = filterNotesForAI(notes, true);
    expect(r.allowed.length).toBe(0);
    expect(r.blocked.length).toBe(2);
    expect(r.blockedAll).toBe(true);
  });

  test("globalOptOut=false에서 aiOptOut만 차단", () => {
    const notes = [
      { id: "a", title: "A", aiOptOut: false },
      { id: "b", title: "B", aiOptOut: true },
      { id: "c", title: "C", aiOptOut: false },
    ];
    const r = filterNotesForAI(notes, false);
    expect(r.allowed.map((n) => n.id)).toEqual(["a", "c"]);
    expect(r.blocked.map((n) => n.id)).toEqual(["b"]);
    expect(r.blockedAll).toBe(false);
  });

  test("빈 입력은 빈 결과", () => {
    const r = filterNotesForAI([], false);
    expect(r.allowed.length).toBe(0);
    expect(r.blocked.length).toBe(0);
    expect(r.blockedAll).toBe(false);
  });
});
