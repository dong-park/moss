import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_BOARD_ID,
  isSystemBoardNote,
  newBoardId,
} from "@/state/boardIds";

/** RFC 4122 v4 UUID 형식. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newBoardId (D2·P1)", () => {
  it("randomUUID가 없으면 getRandomValues로 v4 UUID를 만든다", () => {
    let n = 0;
    vi.stubGlobal("crypto", {
      randomUUID: undefined,
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (n++ * 37) & 0xff;
        return arr;
      },
    });
    const id = newBoardId();
    expect(id).toMatch(UUID_RE);
    // 예전 Date.now()+Math.random 폴백(b-…)이 아니다.
    expect(id.startsWith("b-")).toBe(false);
  });

  it("randomUUID가 있으면 그 값을 쓴다", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-0000000000aa",
    });
    expect(newBoardId()).toBe("00000000-0000-4000-8000-0000000000aa");
  });
});

describe("isSystemBoardNote (P1 술어 단일화)", () => {
  it("null(레거시)과 시스템 UUID만 시스템 보드로 본다", () => {
    expect(isSystemBoardNote({ boardId: null })).toBe(true);
    expect(isSystemBoardNote({ boardId: SYSTEM_BOARD_ID })).toBe(true);
    expect(isSystemBoardNote({ boardId: "b1" })).toBe(false);
    expect(isSystemBoardNote({ boardId: undefined })).toBe(false);
  });
});
