"use client";

import { useState } from "react";
import { layout } from "@/design/tokens";
import { Sidebar } from "@/components/workspace/Sidebar";
import { Canvas } from "@/components/workspace/Canvas";
import { Breadcrumb } from "@/components/workspace/Breadcrumb";
import { SubcanvasUndoToast } from "@/components/workspace/SubcanvasUndoToast";
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
      {/* FEAT-subcanvas: 서브 캔버스 경로 — 캔버스 좌상단 고정 오버레이(중첩 시에만 렌더). */}
      <div
        className="fixed top-3 z-[var(--z-panel)]"
        style={{ left: layout.sidebar.expanded + 12 }}
      >
        <Breadcrumb />
      </div>
      <SidebarDragPreview />
      <ShortcutsBinder />
      <AICallPreview />
      <SignalsPanel open={signalsOpen} onClose={() => setSignalsOpen(false)} />
      <MemoExpandDialog />
      {/* FEAT-subcanvas: 함 삭제 5초 undo 토스트 (position: fixed bottom-center). */}
      <SubcanvasUndoToast />
    </main>
  );
}
