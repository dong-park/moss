import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { DrawingLayer } from "../_shared/DrawingLayer";
import { serializeHandwriting, type HandwritingPoint } from "@/state/cardContent";

/**
 * DrawingLayer — 렌더·속성 검증.
 * 포인터 그리기/지우개는 jsdom 신뢰성이 낮아 브라우저 + handwriting 카드 회귀로 검증한다.
 */
function line(from: [number, number], to: [number, number]): HandwritingPoint[] {
  return [
    { x: from[0], y: from[1] },
    { x: to[0], y: to[1] },
  ];
}

const noop = () => {};

describe("DrawingLayer · 렌더", () => {
  it("value의 path 수만큼 polyline을 그린다", () => {
    const value = serializeHandwriting({
      paths: [line([0, 0], [10, 10]), line([5, 5], [20, 5])],
    });
    const { container } = render(
      <DrawingLayer
        value={value}
        active={false}
        penWidth={2}
        tool="pen"
        onChange={noop}
      />,
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("penWidth가 polyline strokeWidth에 반영된다", () => {
    const value = serializeHandwriting({ paths: [line([0, 0], [10, 10])] });
    const { container } = render(
      <DrawingLayer
        value={value}
        active
        penWidth={5}
        tool="pen"
        onChange={noop}
      />,
    );
    expect(container.querySelector("polyline")?.getAttribute("stroke-width")).toBe(
      "5",
    );
  });

  it("active=false면 pointer-events:none (클릭이 카드로 통과)", () => {
    const { container } = render(
      <DrawingLayer value="" active={false} penWidth={2} tool="pen" onChange={noop} />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.style.pointerEvents).toBe("none");
  });

  it("active=true면 pointer-events:auto + 그리기 커서", () => {
    const { container } = render(
      <DrawingLayer value="" active penWidth={2} tool="pen" onChange={noop} />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.style.pointerEvents).toBe("auto");
    expect(svg.style.cursor).toBe("crosshair");
  });

  it("eraser 도구면 커서가 cell", () => {
    const { container } = render(
      <DrawingLayer value="" active penWidth={2} tool="eraser" onChange={noop} />,
    );
    expect((container.querySelector("svg") as SVGSVGElement).style.cursor).toBe(
      "cell",
    );
  });

  it("빈 value면 polyline 없음", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DrawingLayer value="" active penWidth={2} tool="pen" onChange={onChange} />,
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
