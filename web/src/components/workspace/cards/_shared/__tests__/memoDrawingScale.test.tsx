import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { useDrawing } from "../useDrawing";

function event(x: number, y: number) {
  return { clientX: x, clientY: y, pointerId: 1, stopPropagation() {}, preventDefault() {} } as PointerEvent<SVGSVGElement>;
}

describe('canonical drawing under mobile fit', () => {
  it.each([320, 350, 390, 720])('maps a %ipx display back to unchanged 720px ink coordinates', (width) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.getBoundingClientRect = () => ({ left: 10, top: 20, width } as DOMRect);
    svg.setPointerCapture = vi.fn();
    const onPathsChange = vi.fn();
    const paths = [[{ x: 360, y: 144 }, { x: 400, y: 160 }]];
    const { result, rerender } = renderHook(({tool}: {tool: 'pen' | 'eraser'}) => useDrawing({ paths, active: true, tool,
      onPathsChange, svgRef: { current: svg }, coordinateWidth: 720 }), { initialProps: { tool: 'pen' } });
    act(() => result.current.onPointerDown(event(10 + width / 2, 20 + width / 5)));
    act(() => result.current.onPointerUp(event(0, 0)));
    expect(onPathsChange).toHaveBeenLastCalledWith([...paths, [{ x: 360, y: 144 }, { x: 360, y: 144 }]]);
    rerender({tool: 'eraser'});
    act(() => result.current.onPointerDown(event(10 + width / 2, 20 + width / 5)));
    act(() => result.current.onPointerUp(event(0, 0)));
    expect(onPathsChange).toHaveBeenLastCalledWith([]);
    expect(paths[0][0]).toEqual({ x: 360, y: 144 });
  });
});
