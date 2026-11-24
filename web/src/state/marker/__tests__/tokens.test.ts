import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_WIDTH,
  MARKER_COLORS,
  MARKER_COLOR_VALUE,
  MARKER_WIDTHS,
  MARKER_WIDTH_UNITS,
  markerColorValue,
  markerWidthUnits,
  resolveMarkerColor,
  resolveMarkerWidth,
} from "@/state/marker/tokens";

describe("wall-marker n1 — 마카 토큰", () => {
  it("색 4개·굵기 3개가 이름으로 정의돼 있고 화면 값이 한 표에 있다", () => {
    expect([...MARKER_COLORS]).toEqual(["black", "blue", "red", "green"]);
    expect([...MARKER_WIDTHS]).toEqual(["thin", "mid", "thick"]);
    expect(MARKER_COLOR_VALUE).toEqual({
      black: "#1f2430",
      blue: "#2457b8",
      red: "#d0453c",
      green: "#2f8a57",
    });
    // 굵기는 보드 단위이고 가는 쪽이 더 작다.
    expect(MARKER_WIDTH_UNITS.thin).toBeLessThan(MARKER_WIDTH_UNITS.mid);
    expect(MARKER_WIDTH_UNITS.mid).toBeLessThan(MARKER_WIDTH_UNITS.thick);
  });

  it("모르는 이름은 검정·가는 선으로 읽는다", () => {
    expect(resolveMarkerColor(undefined)).toBe(DEFAULT_MARKER_COLOR);
    expect(resolveMarkerColor("magenta")).toBe("black");
    expect(resolveMarkerWidth(7)).toBe(DEFAULT_MARKER_WIDTH);
    expect(markerColorValue("red")).toBe("#d0453c");
    expect(markerColorValue("nope")).toBe("#1f2430");
    expect(markerWidthUnits("thick")).toBe(MARKER_WIDTH_UNITS.thick);
    expect(markerWidthUnits(undefined)).toBe(MARKER_WIDTH_UNITS.thin);
  });
});
