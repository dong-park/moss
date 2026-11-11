"use client";

import { useEffect, useState } from "react";
import { compactControls } from "@/design/canvasControls";

/** Match the dock and zoom rows without reading window during hydration. */
export function useCompactControls() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const resize = () => setCompact(compactControls(window.innerWidth, window.innerHeight));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return compact;
}
