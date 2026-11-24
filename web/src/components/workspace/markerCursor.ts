import { MARKER_COLOR_VALUE } from "@/state/marker/tokens";
import type { HeldTool } from "@/state/marker/heldTool";

/**
 * wall-marker n2: 벽 위 포인터 — 든 마카의 끝 모양(그 색)이거나 천 모양.
 * SVG data URL이다. hotspot은 마카 끝(좌하단)·천 한가운데.
 */

function svgCursor(svg: string, hotX: number, hotY: number, fallback: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}

export function markerCursor(color: keyof typeof MARKER_COLOR_VALUE): string {
  const fill = MARKER_COLOR_VALUE[color] ?? MARKER_COLOR_VALUE.black;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
    `<path d='M3 25l1.6-5.2L18 6.4l4.6 4.6L9.2 24.4 3 25z' fill='${fill}' stroke='white' stroke-width='1.2' stroke-linejoin='round'/>` +
    `<path d='M18 6.4l2.2-2.2a2 2 0 0 1 2.8 0l1.8 1.8a2 2 0 0 1 0 2.8L22.6 11 18 6.4z' fill='#e9e5da' stroke='white' stroke-width='1.2' stroke-linejoin='round'/>` +
    `</svg>`;
  return svgCursor(svg, 3, 25, "crosshair");
}

export function clothCursor(): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
    `<rect x='4' y='8' width='20' height='13' rx='4' fill='#f4f1e8' stroke='%23555' stroke-width='1.4'/>` +
    `</svg>`;
  return svgCursor(svg, 14, 14, "cell");
}

/** 든 도구 → CSS cursor 값. 안 들었으면 undefined(바탕 커서를 그대로 둔다). */
export function heldToolCursor(tool: HeldTool): string | undefined {
  if (!tool) return undefined;
  return tool.kind === "marker" ? markerCursor(tool.color) : clothCursor();
}
