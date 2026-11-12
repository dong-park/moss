"use client";

import { useEffect, useState } from "react";
import { compactControls } from "@/design/canvasControls";
import { layout } from "@/design/tokens";

/** Match the dock and zoom rows without reading window during hydration. */
export function useCompactControls() {
  return useControlLayout(compactControls);
}

/** The full dock and the additional overview button need separate rows on tablets. */
export function useStackedZoomControls() {
  return useControlLayout(zoomNeedsOwnRow);
}

const zoomNeedsOwnRow = (width: number) => width < layout.breakpoint.desktop;

function useControlLayout(matches: (width: number, height: number) => boolean) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const resize = () => setCompact(matches(window.innerWidth, window.innerHeight));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [matches]);
  return compact;
}
