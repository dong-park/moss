import { describe, expect, it } from "vitest";
import {
  COLLAB_COLOR_COUNT,
  SYSTEM_COLORS,
  assignColorsByJoinOrder,
  colorForIndex,
} from "@/state/presence/colors";

describe("참여자 색 배정", () => {
  it("시스템 색은 8개다", () => {
    expect(SYSTEM_COLORS).toHaveLength(8);
    expect(COLLAB_COLOR_COUNT).toBe(8);
  });

  it("index를 0..7로 돌려 쓴다", () => {
    expect(colorForIndex(0)).toBe(SYSTEM_COLORS[0]);
    expect(colorForIndex(7)).toBe(SYSTEM_COLORS[7]);
    expect(colorForIndex(8)).toBe(SYSTEM_COLORS[0]);
    expect(colorForIndex(-1)).toBe(SYSTEM_COLORS[7]);
  });

  it("접속 순서대로 색을 배정한다", () => {
    const assigned = assignColorsByJoinOrder([101, 202, 303]);
    expect(assigned.get(101)).toBe(SYSTEM_COLORS[0]);
    expect(assigned.get(202)).toBe(SYSTEM_COLORS[1]);
    expect(assigned.get(303)).toBe(SYSTEM_COLORS[2]);
  });

  it("8명을 넘으면 색을 재사용한다", () => {
    const ids = Array.from({ length: 9 }, (_, i) => i + 1);
    const assigned = assignColorsByJoinOrder(ids);
    expect(assigned.get(9)).toBe(SYSTEM_COLORS[0]);
  });

  it("중복 clientId는 첫 순서의 색을 유지한다", () => {
    const assigned = assignColorsByJoinOrder([5, 5, 6]);
    expect(assigned.get(5)).toBe(SYSTEM_COLORS[0]);
    expect(assigned.get(6)).toBe(SYSTEM_COLORS[1]);
  });
});
