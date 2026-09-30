import { describe, expect, it } from "vitest";
import {
  MAX_NAME_LENGTH,
  MAX_PARTICIPANTS,
  MAX_SELECTION,
  participantsFromStates,
} from "../awareness";

describe("participantsFromStates", () => {
  it("자기 자신은 목록에서 빼되 색은 self 포함 전체 순서로 배정한다", () => {
    const states = new Map<number, Record<string, unknown>>([
      [1, { user: { name: "나" } }],
      [5, { user: { name: "민지" } }],
      [3, { user: { name: "동환" } }],
    ]);

    const participants = participantsFromStates(states, 1);

    // self(1)이 색 순서를 차지하므로 3=두 번째 색, 5=세 번째 색.
    expect(participants.map((p) => p.clientId)).toEqual([3, 5]);
    expect(participants[0].user.name).toBe("동환");
    expect(participants[0].user.color).toBe("#ff9f0a");
    expect(participants[1].user.color).toBe("#30d158");
  });

  it("P1: 두 뷰어가 같은 사람에게 같은 색을 배정한다", () => {
    const states = new Map<number, Record<string, unknown>>([
      [1, { user: { name: "가" } }],
      [2, { user: { name: "나" } }],
      [3, { user: { name: "다" } }],
    ]);

    const viewer1 = participantsFromStates(states, 1);
    const viewer2 = participantsFromStates(states, 3);

    const colorOf = (list: typeof viewer1, clientId: number) =>
      list.find((p) => p.clientId === clientId)?.user.color;

    expect(colorOf(viewer1, 2)).toBe(colorOf(viewer2, 2));
    expect(colorOf(viewer1, 2)).toBe("#ff9f0a");
  });

  it("P1: 참여자·선택·이름 크기를 상한으로 자른다 (DoS 방어)", () => {
    const manyParticipants = new Map<number, Record<string, unknown>>();
    for (let i = 0; i < 100; i += 1) {
      manyParticipants.set(i, { user: { name: "가".repeat(300) } });
    }
    const participants = participantsFromStates(manyParticipants);
    expect(participants).toHaveLength(MAX_PARTICIPANTS);
    expect(participants[0].user.name).toHaveLength(MAX_NAME_LENGTH);

    const bigSelection = Array.from({ length: 100 }, (_, i) => ({
      noteId: `n${i}`,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
    }));
    const [one] = participantsFromStates(
      new Map([[9, { user: { name: "옥" }, selection: bigSelection }]]),
    );
    expect(one.selection).toHaveLength(MAX_SELECTION);
  });

  it("cursor·selection·dragging을 검증해 싣는다", () => {
    const states = new Map<number, Record<string, unknown>>([
      [
        2,
        {
          user: { name: "민지" },
          cursor: { x: 12, y: 34 },
          selection: [{ noteId: "n1", x: 1, y: 2, width: 3, height: 4, rotation: 5 }],
          dragging: { noteId: "n2", x: 6, y: 7, rotation: 8 },
        },
      ],
    ]);

    const [p] = participantsFromStates(states);

    expect(p.cursor).toEqual({ x: 12, y: 34 });
    expect(p.selection).toEqual([
      { noteId: "n1", x: 1, y: 2, width: 3, height: 4, rotation: 5 },
    ]);
    expect(p.dragging).toEqual({ noteId: "n2", x: 6, y: 7, rotation: 8 });
  });

  it("모양이 어긋난 원격 값은 버린다 — 잘못된 필드가 렌더를 깨지 않는다", () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, { user: { name: "" } }],
      [3, { user: 42 }],
      [4, { user: { name: "옥" }, cursor: { x: "a", y: 1 } }],
      [5, { user: { name: "정상" }, cursor: { x: 1, y: 2 }, selection: "nope" }],
      [6, { user: { name: "무한" }, cursor: { x: Infinity, y: 0 } }],
    ]);

    const participants = participantsFromStates(states);

    expect(participants.map((p) => p.clientId)).toEqual([4, 5, 6]);
    expect(participants[0].cursor).toBeUndefined();
    expect(participants[1].cursor).toEqual({ x: 1, y: 2 });
    expect(participants[1].selection).toBeUndefined();
    // 숫자 필드는 유한값만 싣는다.
    expect(participants[2].cursor).toBeUndefined();
  });
});
