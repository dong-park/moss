"use client";

import { useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { MemoTable } from "@/components/workspace/table/MemoTable";
import { ViewToggle } from "@/components/workspace/table/ViewToggle";
import { Canvas } from "@/components/workspace/Canvas";
import { Breadcrumb } from "@/components/workspace/Breadcrumb";
import { SubcanvasUndoToast } from "@/components/workspace/SubcanvasUndoToast";
import { MemoExpandDialog } from "@/components/workspace/cards/MemoExpandDialog";
import { Dock } from "@/components/workspace/Dock";
import { DockDragPreview } from "@/components/workspace/DockDragPreview";
import { ShortcutsBinder } from "@/components/workspace/ShortcutsBinder";
import { AICallPreview } from "@/components/privacy/AICallPreview";
import { SignalsPanel } from "@/components/signals/SignalsPanel";
import { ExportModal } from "@/components/export/ExportModal";
import { ImportDialog } from "@/components/export/ImportDialog";

export default function WorkspacePage() {
  const [signalsOpen, setSignalsOpen] = useState(false);
  // FEAT-memo-table-view: 캔버스 ↔ 표. 표 모드에선 Canvas·Dock·캔버스 단축키를
  // 숨긴다(spec §4 — 표에서 캔버스 단축키가 먹지 않게).
  const view = useWorkspace((s) => s.view);
  const isCanvas = view === "canvas";

  return (
    // FEAT-sticky-redesign n8: 사이드바 DOM 제거 — 캔버스가 화면 왼쪽 끝부터 시작한다(AC-1).
    <main className="grid h-screen w-screen grid-cols-1 grid-rows-1">
      {isCanvas ? <Canvas /> : <MemoTable />}

      {/* FEAT-memo-table-view AC-1: 캔버스 ↔ 표 토글(우상단 고정). */}
      <div className="fixed top-3 right-4 z-[var(--z-panel)]">
        <ViewToggle />
      </div>

      {isCanvas && (
        <>
          {/* FEAT-subcanvas: 서브 캔버스 경로 — 캔버스 좌상단 고정 오버레이(중첩 시에만 렌더). */}
          <div className="fixed top-3 left-3 z-[var(--z-panel)]">
            <Breadcrumb />
          </div>
          <Dock
            onSignalsClick={() => setSignalsOpen((v) => !v)}
            signalsOpen={signalsOpen}
          />
          <DockDragPreview />
          <ShortcutsBinder />
        </>
      )}
      <AICallPreview />
      <SignalsPanel open={signalsOpen} onClose={() => setSignalsOpen(false)} />
      <MemoExpandDialog />
      {/* FEAT-subcanvas: 함 삭제 5초 undo 토스트 (position: fixed bottom-center). */}
      <SubcanvasUndoToast />
      <ExportModal />
      <ImportDialog />
    </main>
  );
}
