import { describe, expect, it } from "vitest";
import { SYSTEM_BOARD_ID } from "@/state/boardIds";
import { systemBoardName } from "@/state/systemBoardName";

const row = (id: string, name: string) => ({ id, name });

describe("systemBoardName — 첫 벽의 표시 이름", () => {
  it("저장된 이름이 없거나 공백뿐이면 '내 벽'", () => {
    expect(systemBoardName([])).toBe("내 벽");
    expect(systemBoardName([row(SYSTEM_BOARD_ID, "")])).toBe("내 벽");
    expect(systemBoardName([row(SYSTEM_BOARD_ID, "   ")])).toBe("내 벽");
  });

  it("저장된 이름이 있으면 그 이름(앞뒤 공백 제외)", () => {
    expect(systemBoardName([row(SYSTEM_BOARD_ID, " 이직 고민 ")])).toBe("이직 고민");
  });

  it("다른 보드의 이름은 쓰지 않는다", () => {
    expect(systemBoardName([row("other", "팀 보드")])).toBe("내 벽");
  });

  it("Map도 받는다", () => {
    const map = new Map([[SYSTEM_BOARD_ID, row(SYSTEM_BOARD_ID, "일상")]]);
    expect(systemBoardName(map)).toBe("일상");
    expect(systemBoardName(new Map())).toBe("내 벽");
  });

  it("넘겨 준 번역기를 쓴다", () => {
    const t = (key: string) => `[${key}]`;
    expect(systemBoardName([], t)).toBe("[workspace.boardPicker.system]");
  });
});
