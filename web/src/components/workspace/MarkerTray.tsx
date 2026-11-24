"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { MARKER_COLOR_VALUE, type MarkerColor } from "@/state/marker/tokens";
import { useT } from "@/i18n/Provider";
import { MarkerPanel } from "./MarkerPanel";

/**
 * 독의 마카 버튼 하나. 색·굵기·천은 이 버튼을 눌러 연 메뉴에만 있다.
 * 메뉴 밖을 누르면 메뉴만 닫히고, 집어 든 도구는 그대로다.
 */
export function MarkerTray() {
  const t = useT();
  const heldTool = useWorkspace((s) => s.heldTool);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const held = heldTool?.kind === "marker" || heldTool?.kind === "cloth";
  const color: MarkerColor = heldTool?.kind === "marker" ? heldTool.color : "black";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex h-full items-center">
      <button
        type="button"
        aria-label={t("workspace.marker.panel.title")}
        aria-pressed={held}
        aria-expanded={open}
        data-marker-tray="true"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus,#4f7cf3)]"
      >
        <MarkerGlyph color={color} lifted={heldTool?.kind === "marker"} />
      </button>
      {open && <MarkerPanel />}
    </div>
  );
}

function MarkerGlyph({ color, lifted }: { color: MarkerColor; lifted: boolean }) {
  const fill = MARKER_COLOR_VALUE[color];
  return (
    <svg aria-hidden="true" width="28" height="14" viewBox="0 0 40 16">
      <rect x="1" y="3" width="25" height="10" rx="3" fill={fill} />
      <rect x="24" y="4" width="10" height="8" rx="1.5" fill="#efeade" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <path d="M34 5.2 L39 8 L34 10.8 Z" fill={lifted ? fill : "#1f2430"} />
    </svg>
  );
}
