import { describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render, renderHook } from "@testing-library/react";
import { DrawingLayer } from "../DrawingLayer";
import { eraseArea, pathsIntersect, useDrawing, type DrawingStroke } from "../useDrawing";
import { parseStrokes, serializeStrokes } from "@/state/cardContent";
import { MARKER_COLOR_VALUE, MARKER_WIDTH_UNITS } from "@/state/marker/tokens";

/**
 * wall-marker n3 — 그리기 엔진: eraseArea(면적 지우기)·획별 색/굵기 렌더·두 포인터 취소·
 * 좌표 변환 주입. 포인터는 jsdom에서 PointerEvent 필드를 직접 실어 보낸다.
 */

function stroke(
  id: string,
  pts: Array<[number, number]>,
  extra: Partial<Pick<DrawingStroke, "color" | "width">> = {},
): DrawingStroke {
  return {
    id,
    points: pts.map(([x, y]) => ({ x, y })),
    color: extra.color ?? "black",
    width: extra.width ?? "thin",
  };
}

function seqId() {
  let n = 0;
  return () => `new-${++n}`;
}

describe("eraseArea · 면적 지우기", () => {
  it("가로 직선의 가운데만 문지르면 양쪽 두 조각이 남는다", () => {
    const line = stroke("a", [
      [0, 0],
      [100, 0],
    ]);
    const r = eraseArea([line], [{ x: 50, y: 0 }], 6, seqId());

    expect(r.removedIds).toEqual(["a"]);
    expect(r.added).toHaveLength(2);
    const [left, right] = r.added;
    // 왼쪽 조각은 0에서 시작해 가운데 앞에서 끝나고, 오른쪽은 가운데 뒤에서 100까지 간다.
    expect(left.points[0]).toEqual({ x: 0, y: 0 });
    expect(left.points[left.points.length - 1].x).toBeLessThan(50);
    expect(left.points[left.points.length - 1].x).toBeGreaterThan(30);
    expect(right.points[0].x).toBeGreaterThan(50);
    expect(right.points[0].x).toBeLessThan(70);
    expect(right.points[right.points.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it("닿지 않은 획은 결과에 들지 않는다", () => {
    const near = stroke("near", [
      [0, 0],
      [100, 0],
    ]);
    const far = stroke("far", [
      [0, 60],
      [100, 60],
    ]);
    const r = eraseArea([near, far], [{ x: 50, y: 0 }], 6, seqId());
    expect(r.removedIds).toEqual(["near"]);
    expect(r.added.every((p) => p.points.every((pt) => pt.y === 0))).toBe(true);
  });

  it("끝만 문지르면 한 조각이 남는다", () => {
    const line = stroke("a", [
      [0, 0],
      [100, 0],
    ]);
    const r = eraseArea(
      [line],
      [
        { x: 98, y: 0 },
        { x: 104, y: 0 },
      ],
      6,
      seqId(),
    );
    expect(r.removedIds).toEqual(["a"]);
    expect(r.added).toHaveLength(1);
    expect(r.added[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(r.added[0].points[r.added[0].points.length - 1].x).toBeLessThan(98);
  });

  it("전부 문지르면 원본만 지워지고 조각은 없다", () => {
    const line = stroke("a", [
      [0, 0],
      [20, 0],
    ]);
    const r = eraseArea(
      [line],
      [
        { x: -5, y: 0 },
        { x: 25, y: 0 },
      ],
      6,
      seqId(),
    );
    expect(r.removedIds).toEqual(["a"]);
    expect(r.added).toEqual([]);
  });

  it("조각이 점 1개 이하면 버린다", () => {
    // 길이 3짜리 짧은 획 — 반경 6 안쪽 한쪽 끝이 닿으면 나머지는 점 하나도 못 남긴다.
    const tiny = stroke("t", [
      [0, 0],
      [3, 0],
    ]);
    const r = eraseArea([tiny], [{ x: 4, y: 0 }], 6, seqId());
    expect(r.removedIds).toEqual(["t"]);
    expect(r.added).toEqual([]);
  });

  it("조각은 원본의 색·굵기를 이어받고 서로 다른 새 id를 받는다", () => {
    const line = stroke(
      "a",
      [
        [0, 0],
        [100, 0],
      ],
      { color: "red", width: "thick" },
    );
    const r = eraseArea([line], [{ x: 50, y: 0 }], 6, seqId());
    expect(r.added.map((p) => p.id)).toEqual(["new-1", "new-2"]);
    expect(r.added.every((p) => p.color === "red" && p.width === "thick")).toBe(true);
  });

  it("점(탭)은 닿으면 지워지고 안 닿으면 그대로다", () => {
    const dot = stroke("d", [
      [10, 10],
      [10, 10],
    ]);
    expect(eraseArea([dot], [{ x: 12, y: 10 }], 6, seqId()).removedIds).toEqual(["d"]);
    expect(eraseArea([dot], [{ x: 40, y: 10 }], 6, seqId()).removedIds).toEqual([]);
  });

  it("pathsIntersect는 한 정의로 남아 임계를 인자로 받는다", () => {
    const a = [{ x: 0, y: 0 }];
    const b = [{ x: 5, y: 0 }];
    expect(pathsIntersect(a, b)).toBe(true);
    expect(pathsIntersect(a, b, 3)).toBe(false);
  });
});

/* ───────────── 포인터 시나리오 ───────────── */

function pointer(
  target: Element,
  type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel",
  init: { pointerId: number; clientX: number; clientY: number; pointerType?: string },
) {
  const ev = createEvent[type](target, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(ev, "pointerId", { value: init.pointerId });
  Object.defineProperty(ev, "pointerType", { value: init.pointerType ?? "touch" });
  fireEvent(target, ev);
}

function layerSvg(container: HTMLElement) {
  return container.querySelector("svg[data-drawing-layer]") as SVGSVGElement;
}

describe("DrawingLayer · 획별 색·굵기 렌더", () => {
  it("색이 다른 두 획은 서로 다른 stroke 색으로 그려진다", () => {
    const value = serializeStrokes([
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], color: "red", width: "thin" },
      { points: [{ x: 0, y: 5 }, { x: 10, y: 5 }], color: "blue", width: "thin" },
    ]);
    const { container } = render(
      <DrawingLayer value={value} active={false} tool="pen" onChange={() => {}} />,
    );
    const lines = container.querySelectorAll("polyline");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("stroke")).toBe(MARKER_COLOR_VALUE.red);
    expect(lines[1].getAttribute("stroke")).toBe(MARKER_COLOR_VALUE.blue);
    expect(lines[0].getAttribute("stroke")).not.toBe(lines[1].getAttribute("stroke"));
  });

  it("굵기 이름이 보드 단위 굵기로 그려진다", () => {
    const value = serializeStrokes([
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], color: "black", width: "mid" },
      { points: [{ x: 0, y: 5 }, { x: 10, y: 5 }], color: "black", width: "thick" },
    ]);
    const { container } = render(
      <DrawingLayer value={value} active={false} tool="pen" onChange={() => {}} />,
    );
    const lines = container.querySelectorAll("polyline");
    expect(lines[0].getAttribute("stroke-width")).toBe(String(MARKER_WIDTH_UNITS.mid));
    expect(lines[1].getAttribute("stroke-width")).toBe(String(MARKER_WIDTH_UNITS.thick));
  });

  it("옛 획(색·굵기 없음)은 본문색·penWidth로 보인다", () => {
    const legacy = JSON.stringify({ paths: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]] });
    const { container } = render(
      <DrawingLayer
        value={legacy}
        active={false}
        penWidth={3}
        tool="pen"
        onChange={() => {}}
      />,
    );
    const line = container.querySelector("polyline") as SVGPolylineElement;
    expect(line.getAttribute("stroke")).toBe("var(--color-text)");
    expect(line.getAttribute("stroke-width")).toBe("3");
  });
});

describe("DrawingLayer · 지우개가 색·굵기를 지킨다", () => {
  it("색 있는 획 → 지우개 → 남은 조각과 다른 획의 색·굵기가 유지된다", () => {
    const value = serializeStrokes([
      { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "red", width: "thick" },
      { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], color: "blue", width: "mid" },
    ]);
    const onChange = vi.fn();
    const { container } = render(
      <DrawingLayer
        value={value}
        active
        tool="eraser"
        eraserRadius={6}
        onChange={onChange}
      />,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 50, clientY: 0 });
    pointer(svg, "pointerUp", { pointerId: 1, clientX: 50, clientY: 0 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = parseStrokes(onChange.mock.calls[0][0] as string);
    // 파란 획은 그대로, 빨간 획은 두 조각으로 — 모두 색·굵기를 지켰다.
    const blue = next.filter((s) => s.color === "blue");
    const red = next.filter((s) => s.color === "red");
    expect(blue).toHaveLength(1);
    expect(blue[0].width).toBe("mid");
    expect(red).toHaveLength(2);
    expect(red.every((s) => s.width === "thick")).toBe(true);
    // 검정·가는 선으로 되돌아간 획이 없다.
    expect(next.some((s) => s.color === "black")).toBe(false);
  });

  it("펜으로 덧그려도 기존 획의 색·굵기는 유지되고 새 획은 고른 색·굵기를 싣는다", () => {
    const value = serializeStrokes([
      { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], color: "green", width: "mid" },
    ]);
    const onChange = vi.fn();
    const { container } = render(
      <DrawingLayer
        value={value}
        active
        tool="pen"
        color="red"
        width="thick"
        onChange={onChange}
      />,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 5, clientY: 20 });
    pointer(svg, "pointerMove", { pointerId: 1, clientX: 30, clientY: 25 });
    pointer(svg, "pointerUp", { pointerId: 1, clientX: 30, clientY: 25 });

    const next = parseStrokes(onChange.mock.calls[0][0] as string);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ color: "green", width: "mid" });
    expect(next[1]).toMatchObject({ color: "red", width: "thick" });
    expect(next[1].points).toHaveLength(2);
  });

  it("탭은 점으로 저장된다", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DrawingLayer value="" active tool="pen" onChange={onChange} />,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 7, clientY: 9 });
    pointer(svg, "pointerUp", { pointerId: 1, clientX: 7, clientY: 9 });
    const next = parseStrokes(onChange.mock.calls[0][0] as string);
    expect(next).toHaveLength(1);
    expect(next[0].points).toEqual([
      { x: 7, y: 9 },
      { x: 7, y: 9 },
    ]);
  });
});

describe("DrawingLayer · 확정할 때 점 솎기 (W11)", () => {
  function drawn(points: Array<[number, number]>) {
    const onChange = vi.fn();
    const { container } = render(
      <DrawingLayer value="" active tool="pen" onChange={onChange} />,
    );
    const svg = layerSvg(container);
    const [first, ...rest] = points;
    pointer(svg, "pointerDown", { pointerId: 1, clientX: first[0], clientY: first[1] });
    for (const [x, y] of rest) pointer(svg, "pointerMove", { pointerId: 1, clientX: x, clientY: y });
    const last = points[points.length - 1];
    pointer(svg, "pointerUp", { pointerId: 1, clientX: last[0], clientY: last[1] });
    return parseStrokes(onChange.mock.calls[0][0] as string)[0].points;
  }

  it("이전 점과 거의 같은 자리의 점은 건너뛰고 첫·끝 점은 남는다", () => {
    const pts = drawn([
      [0, 0],
      [0.1, 0],
      [0.2, 0.1],
      [10, 0],
      [10.1, 0],
    ]);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10.1, y: 0 },
    ]);
  });

  it("같은 자리에서 흔들리다 뗀 획은 첫 점과 끝 점만 남는다", () => {
    const pts = drawn([
      [5, 5],
      [5.1, 5],
      [5, 5.1],
    ]);
    // 끝 점(뗀 자리)은 남는다 — 탭이 아니라 같은 자리에서 끝난 획이다.
    expect(pts).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5.1 },
    ]);
  });

  it("뚜렷하게 움직인 점은 그대로 남는다", () => {
    const line: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => [i * 3, i % 2]);
    expect(drawn(line)).toHaveLength(20);
  });
});

describe("useDrawing · draft는 이벤트마다 배열을 복사하지 않는다 (W11)", () => {
  it("움직여도 같은 배열에 점이 쌓이고 다시 그려진다", () => {
    const svgRef = { current: null } as { current: SVGSVGElement | null };
    const { result } = renderHook(() =>
      useDrawing({
        strokes: [],
        active: true,
        tool: "pen",
        onCommit: () => {},
        onErase: () => {},
        svgRef,
      }),
    );
    const ev = (x: number, y: number) =>
      ({
        pointerId: 1,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
        stopPropagation() {},
        preventDefault() {},
      }) as unknown as React.PointerEvent<SVGSVGElement>;

    act(() => result.current.onPointerDown(ev(0, 0)));
    const first = result.current.draft;
    expect(first).toHaveLength(1);
    for (let i = 1; i <= 50; i++) act(() => result.current.onPointerMove(ev(i * 4, i)));

    expect(result.current.draft).toBe(first);
    expect(result.current.draft).toHaveLength(51);
    act(() => result.current.onPointerUp(ev(200, 50)));
    expect(result.current.draft).toEqual([]);
  });
});

describe("DrawingLayer · 두 손가락 (T12)", () => {
  it("그리는 중 두 번째 pointerdown이 오면 획이 확정되지 않고 onCancel이 불린다", () => {
    const onChange = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <DrawingLayer value="" active tool="pen" onChange={onChange} onCancel={onCancel} />,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 5, clientY: 5 });
    pointer(svg, "pointerMove", { pointerId: 1, clientX: 20, clientY: 20 });
    pointer(svg, "pointerDown", { pointerId: 2, clientX: 80, clientY: 80 });
    pointer(svg, "pointerMove", { pointerId: 1, clientX: 40, clientY: 40 });
    pointer(svg, "pointerUp", { pointerId: 2, clientX: 80, clientY: 80 });
    pointer(svg, "pointerUp", { pointerId: 1, clientX: 40, clientY: 40 });

    expect(onChange).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-drawing-draft]")).toBeNull();
  });

  it("두 번째 pointerdown은 가로채지 않아 줌·팬이 이어받는다", () => {
    const parentDown = vi.fn();
    const { container } = render(
      <div onPointerDown={parentDown}>
        <DrawingLayer value="" active tool="pen" onChange={() => {}} />
      </div>,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 5, clientY: 5 });
    expect(parentDown).not.toHaveBeenCalled(); // 첫 손가락은 엔진이 먹는다
    pointer(svg, "pointerDown", { pointerId: 2, clientX: 80, clientY: 80 });
    expect(parentDown).toHaveBeenCalledTimes(1); // 두 번째는 위로 올라간다
  });

  it("두 손가락을 뗀 뒤에는 다시 그릴 수 있다", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DrawingLayer value="" active tool="pen" onChange={onChange} />,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 5, clientY: 5 });
    pointer(svg, "pointerDown", { pointerId: 2, clientX: 80, clientY: 80 });
    pointer(svg, "pointerUp", { pointerId: 2, clientX: 80, clientY: 80 });
    pointer(svg, "pointerUp", { pointerId: 1, clientX: 5, clientY: 5 });
    expect(onChange).not.toHaveBeenCalled();

    pointer(svg, "pointerDown", { pointerId: 3, clientX: 10, clientY: 10 });
    pointer(svg, "pointerMove", { pointerId: 3, clientX: 30, clientY: 10 });
    pointer(svg, "pointerUp", { pointerId: 3, clientX: 30, clientY: 10 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("DrawingLayer · 좌표 변환 주입", () => {
  it("toLocal을 주면 저장 좌표가 그 함수의 결과다(벽 보드 좌표·기운 포스트잇)", () => {
    const onChange = vi.fn();
    const toLocal = (cx: number, cy: number) => ({ x: cx * 2 + 100, y: cy * 2 - 50 });
    const { container } = render(
      <DrawingLayer value="" active tool="pen" toLocal={toLocal} onChange={onChange} />,
    );
    const svg = layerSvg(container);
    pointer(svg, "pointerDown", { pointerId: 1, clientX: 10, clientY: 20 });
    pointer(svg, "pointerMove", { pointerId: 1, clientX: 30, clientY: 40 });
    pointer(svg, "pointerUp", { pointerId: 1, clientX: 30, clientY: 40 });
    const next = parseStrokes(onChange.mock.calls[0][0] as string);
    expect(next[0].points).toEqual([
      { x: 120, y: -10 },
      { x: 160, y: 30 },
    ]);
  });
});
