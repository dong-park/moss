"use client";

import { useState } from "react";
import { layout } from "@/design/tokens";
import { Sidebar } from "@/components/workspace/Sidebar";
import { Canvas } from "@/components/workspace/Canvas";
import { MemoExpandDialog } from "@/components/workspace/cards/MemoExpandDialog";
import { SidebarDragPreview } from "@/components/workspace/SidebarDragPreview";
import { ShortcutsBinder } from "@/components/workspace/ShortcutsBinder";
import { AICallPreview } from "@/components/privacy/AICallPreview";
import { SignalsPanel } from "@/components/signals/SignalsPanel";

export default function WorkspacePage() {
  const [signalsOpen, setSignalsOpen] = useState(false);
  return (
    <main
      className="grid h-screen w-screen"
      style={{
        gridTemplateColumns: `${layout.sidebar.expanded}px 1fr`,
        gridTemplateRows: "1fr",
      }}
    >
      <Sidebar onSignalsClick={() => setSignalsOpen((v) => !v)} />
      <Canvas />
      <SidebarDragPreview />
      <ShortcutsBinder />
      <AICallPreview />
      <SignalsPanel open={signalsOpen} onClose={() => setSignalsOpen(false)} />
      <MemoExpandDialog />
    </main>
  );
}
