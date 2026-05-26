import { describe, test, expect } from "vitest";
import type { Note } from "@/state/db/schema";
import { buildRhythm } from "../buildRhythm";

function noteAtHour(hour: number, content = "사고", id = String(Math.random())): Note {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return {
    id,
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    content,
    aiOptOut: false,
    createdAt: d.getTime(),
    updatedAt: d.getTime(),
    lastVisitedAt: d.getTime(),
  };
}

describe("buildRhythm", () => {
  test("빈 입력은 24개 0 배열", () => {
    const r = buildRhythm([]);
    expect(r).toHaveLength(24);
    expect(r.every((v) => v === 0)).toBe(true);
  });

  test("단일 시간대 집중", () => {
    const notes = [
      noteAtHour(9, "메모", "1"),
      noteAtHour(9, "메모", "2"),
      noteAtHour(9, "메모", "3"),
    ];
    const r = buildRhythm(notes);
    expect(r[9]).toBe(3);
    expect(r.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test("여러 시간대 분산", () => {
    const r = buildRhythm([
      noteAtHour(9, "a", "1"),
      noteAtHour(14, "b", "2"),
      noteAtHour(23, "c", "3"),
    ]);
    expect(r[9]).toBe(1);
    expect(r[14]).toBe(1);
    expect(r[23]).toBe(1);
    expect(r[0]).toBe(0);
  });

  test("본문이 빈 메모(image-only 등)는 제외", () => {
    const r = buildRhythm([
      noteAtHour(10, "", "img1"),
      noteAtHour(10, "   ", "img2"),
      noteAtHour(10, "사고를 남김", "real"),
    ]);
    expect(r[10]).toBe(1);
  });

  test("로컬 타임존의 getHours 기준", () => {
    const d = new Date();
    d.setHours(7, 30, 15, 0);
    const note: Note = {
      id: "x",
      boardId: null,
      kind: "text",
      x: 0,
      y: 0,
      width: 240,
      rotation: 0,
      content: "morning thought",
      aiOptOut: false,
      createdAt: d.getTime(),
      updatedAt: d.getTime(),
      lastVisitedAt: d.getTime(),
    };
    const r = buildRhythm([note]);
    expect(r[7]).toBe(1);
  });
});
