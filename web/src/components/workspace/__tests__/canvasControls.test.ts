import { describe, expect, it } from "vitest";
import { canvasControlInsets, compactControls } from "@/design/canvasControls";
import { useWorkspace } from "@/state/workspace";

describe("canvas control geometry", () => {
  it.each([360, 390, 430, 767])("reserves both control rows at %ipx", width => {
    expect(compactControls(width, 800)).toBe(true);
    expect(canvasControlInsets(width, 800).bottom).toBe(148);
  });
  it("keeps desktop geometry and supports short landscape", () => {
    expect(compactControls(1280, 800)).toBe(false);
    expect(canvasControlInsets(1280, 800).bottom).toBe(96);
    expect(compactControls(844, 390)).toBe(true);
  });
  it("includes measured safe-area obstruction relative to canvas", () => {
    expect(canvasControlInsets(390, 700, { bottom: 750 }, [{ top: 565, bottom: 617 }]).bottom).toBe(197);
  });
  it("fits tall content above both mobile rows without altering automatic fit", () => {
    const before = useWorkspace.getState();
    useWorkspace.setState({ cards: [{ id: "tall", kind: "text", content: "", x: 0, y: 0, width: 240, height: 2000 }] });
    useWorkspace.getState().fitAllCards({ width: 390, height: 700 });
    const v = useWorkspace.getState().viewport;
    expect(2000 * v.scale + v.y).toBeLessThanOrEqual(552);
    expect(v.y).toBeGreaterThanOrEqual(64);
    useWorkspace.setState(before);
  });
});
