"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={400}>
      {children}
    </Tooltip.Provider>
  );
}
