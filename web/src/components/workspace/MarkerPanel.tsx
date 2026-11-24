"use client";

import { useWorkspace } from "@/state/workspace";
import { isClothHeld, isMarkerHeld } from "@/state/marker/heldTool";
import {
  MARKER_COLORS,
  MARKER_COLOR_VALUE,
  MARKER_WIDTHS,
  type MarkerColor,
  type MarkerWidth,
} from "@/state/marker/tokens";
import { useT } from "@/i18n/Provider";

/** 굵기 점 지름(px) — 화면에서 고르기 좋은 미리보기 크기. 실제 굵기는 tokens가 정한다. */
const WIDTH_DOT_PX: Record<MarkerWidth, number> = { thin: 6, mid: 10, thick: 15 };

/**
 * wall-marker n2: 마카 패널 — 색 4개, 굵기 점 3개, 지우기 안내 한 줄.
 *
 * 들고 있는 마카의 색과 지금 굵기에 테두리를 둔다. 색을 고르면 트레이에서 그 마카가
 * 들린다(`holdMarker`) — 패널에는 따로 색 상태가 없다. 굵기는 다음 획부터 적용된다.
 */
export function MarkerPanel() {
  const t = useT();
  const heldTool = useWorkspace((s) => s.heldTool);
  const markerWidth = useWorkspace((s) => s.markerWidth);
  const holdMarker = useWorkspace((s) => s.holdMarker);
  const holdCloth = useWorkspace((s) => s.holdCloth);
  const releaseTool = useWorkspace((s) => s.releaseTool);
  const setMarkerWidth = useWorkspace((s) => s.setMarkerWidth);
  const heldColor = isMarkerHeld(heldTool) ? heldTool.color : null;
  const clothHeld = isClothHeld(heldTool);

  const colorLabels: Record<MarkerColor, string> = {
    black: t("workspace.marker.color.black"),
    blue: t("workspace.marker.color.blue"),
    red: t("workspace.marker.color.red"),
    green: t("workspace.marker.color.green"),
  };
  const widthLabels: Record<MarkerWidth, string> = {
    thin: t("workspace.marker.width.thin"),
    mid: t("workspace.marker.width.mid"),
    thick: t("workspace.marker.width.thick"),
  };

  return (
    <div
      role="group"
      aria-label={t("workspace.marker.panel.title")}
      data-marker-panel="true"
      className="absolute bottom-full left-0 z-[var(--z-panel)] mb-3 w-60 rounded-xl px-3.5 py-3 text-left"
      style={{ background: "var(--gradient-paper)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="text-[13px] font-medium text-text">
        {t("workspace.marker.panel.title")}
      </div>

      <div role="radiogroup" aria-label={t("workspace.marker.panel.color")} className="mt-2.5 flex gap-2.5">
        {MARKER_COLORS.map((c) => {
          const selected = heldColor === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={colorLabels[c]}
              title={colorLabels[c]}
              onClick={() => (heldColor === c ? releaseTool() : holdMarker(c))}
              className="h-6 w-6 cursor-pointer rounded-full transition-transform hover:scale-110"
              style={{
                background: MARKER_COLOR_VALUE[c],
                boxShadow: selected
                  ? "0 0 0 2px var(--color-bg, #fff), 0 0 0 4px currentColor"
                  : "none",
                color: MARKER_COLOR_VALUE[c],
              }}
            />
          );
        })}
      </div>

      <div className="mt-3.5 text-[12px] text-text-muted">
        {t("workspace.marker.panel.width")}
      </div>
      <div role="radiogroup" aria-label={t("workspace.marker.panel.width")} className="mt-2 flex items-center gap-2.5">
        {MARKER_WIDTHS.map((w) => {
          const selected = markerWidth === w;
          const d = WIDTH_DOT_PX[w];
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={widthLabels[w]}
              title={widthLabels[w]}
              onClick={() => setMarkerWidth(w)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[color:var(--color-hover)]"
              style={{
                boxShadow: selected ? "inset 0 0 0 1.5px var(--color-text, #1f2430)" : "none",
              }}
            >
              <span
                aria-hidden="true"
                className="rounded-full"
                style={{
                  width: d,
                  height: d,
                  background: heldColor ? MARKER_COLOR_VALUE[heldColor] : "var(--color-text, #1f2430)",
                }}
              />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={t("workspace.marker.cloth")}
        aria-pressed={clothHeld}
        onClick={() => (clothHeld ? releaseTool() : holdCloth())}
        className="mt-3 w-full cursor-pointer rounded-lg border border-border px-2 py-1.5 text-left text-[12px] text-text"
        style={{ boxShadow: clothHeld ? "inset 0 0 0 1.5px var(--color-text, #1f2430)" : "none" }}
      >
        {t("workspace.marker.cloth")}
      </button>

      <div className="mt-2 text-[11px] leading-snug text-text-muted">
        {t("workspace.marker.panel.erase")}
      </div>
    </div>
  );
}
