"use client";

import { TEXT_SIZE_PX, useWorkspace, type Card } from "@/state/workspace";
import type { TextSize } from "@/state/db/schema";
import { useT } from "@/i18n/Provider";
import { TEXT_COLOR_PRESETS, TEXT_DEFAULT_COLOR } from "./style";

const SIZES: TextSize[] = ["s", "m", "l", "xl"];

/**
 * FEAT-text-tool §6: 선택된 textbox 위에 뜨는 크기·색 툴바.
 *
 * 카드 안쪽(Content 루트)에 absolute로 얹는다 — DraggableCard가 textbox만
 * overflow:visible이라 카드 위로 삐져나와도 잘리지 않는다.
 * mousedown을 멈춰 드래그/선택 해제로 번지지 않게 한다(툴바 조작은 클릭 전용).
 */
export function TextStyleToolbar({ card }: { card: Card }) {
  const t = useT();
  const setTextStyle = useWorkspace((s) => s.setTextStyle);
  const activeSize = card.textSize ?? "m";
  const activeColor = card.color ?? TEXT_DEFAULT_COLOR;

  return (
    <div
      role="toolbar"
      aria-label={t("workspace.textbox.toolbar.label")}
      data-textbox-toolbar
      // preventDefault: 툴바 클릭이 textarea 포커스를 빼앗아 편집이 끝나지 않게.
      // stopPropagation: 카드 드래그/선택 해제로 번지지 않게.
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute -top-10 left-0 z-[32] flex items-center gap-1 rounded-lg border border-border bg-bg px-1.5 py-1 shadow-card"
    >
      {SIZES.map((size) => (
        <button
          key={size}
          type="button"
          aria-label={t(`workspace.textbox.size.${size}`)}
          aria-pressed={activeSize === size}
          onClick={() => setTextStyle(card.id, { textSize: size })}
          className={[
            "flex h-6 w-7 cursor-pointer items-center justify-center rounded-md text-[12px] font-semibold transition-colors",
            activeSize === size
              ? "bg-panel text-text"
              : "text-text-soft hover:bg-panel hover:text-text",
          ].join(" ")}
          style={{ fontSize: Math.min(12, TEXT_SIZE_PX[size] * 0.5) }}
        >
          {size.toUpperCase()}
        </button>
      ))}

      <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

      {TEXT_COLOR_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          aria-label={t(`workspace.textbox.color.${preset.key}`)}
          aria-pressed={activeColor === preset.value}
          onClick={() => setTextStyle(card.id, { color: preset.value })}
          className={[
            "h-5 w-5 cursor-pointer rounded-full border transition-transform",
            activeColor === preset.value
              ? "scale-110 border-text"
              : "border-border hover:scale-105",
          ].join(" ")}
          style={{ background: preset.value }}
        />
      ))}
    </div>
  );
}
