"use client";

import { useState } from "react";
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
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { AuthSessionOverlay } from "@/components/auth/SessionExpiredCard";
import { WorkspaceGate } from "@/components/auth/WorkspaceGate";
import { CollabSession } from "@/components/collab/CollabSession";
import { ShareControlMount } from "@/components/share/ShareControlMount";
import { OfflineBadge } from "@/components/presence/OfflineBadge";

export default function WorkspacePage() {
  const [signalsOpen, setSignalsOpen] = useState(false);
  return (
    // FEAT-sticky-redesign n8: 사이드바 DOM 제거 — 캔버스가 화면 왼쪽 끝부터 시작한다(AC-1).
    <main className="grid h-screen w-screen grid-cols-1 grid-rows-1">
      {/* FEAT-onboarding-routes n2: 세션 복원은 게이트 밖에서 항상 돈다. */}
      <AuthBootstrap />
      <WorkspaceGate>
        <Canvas />
        {/* FEAT-subcanvas: 서브 캔버스 경로 — 캔버스 좌상단 고정 오버레이(중첩 시에만 렌더). */}
        <div className="fixed top-3 left-3 z-[var(--z-panel)]">
          <Breadcrumb />
        </div>
        {/* FEAT-collab-auth n7: 우상단 오프라인 표시 + 공유 아이콘. */}
        <div className="fixed top-3 right-3 z-[var(--z-panel)] flex items-center gap-2">
          <OfflineBadge />
          <ShareControlMount />
        </div>
        <CollabSession />
        <Dock
          onSignalsClick={() => setSignalsOpen((v) => !v)}
          signalsOpen={signalsOpen}
        />
        <DockDragPreview />
        <ShortcutsBinder />
        <AICallPreview />
        <SignalsPanel open={signalsOpen} onClose={() => setSignalsOpen(false)} />
        <MemoExpandDialog />
        {/* FEAT-subcanvas: 함 삭제 5초 undo 토스트 (position: fixed bottom-center). */}
        <SubcanvasUndoToast />
        <ExportModal />
        <ImportDialog />
        <AuthSessionOverlay />
      </WorkspaceGate>
    </main>
  );
}
