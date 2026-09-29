"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { setBoardNavigator, useWorkspace } from "@/state/workspace";
import {
  resolveBoardAccess,
  type BoardAccess,
} from "@/state/boardAccess";
import { BoardAccessCard } from "./BoardAccessCard";

/** 보드 주소(`/b/[boardId]`)를 보드 전환의 원본으로 잇는 배선 (n3 D8).
 *
 * - 스토어의 보드 전환 요청(navigateToBoard)이 오면 이 라우터의 push로 URL을 바꾼다.
 *   상태 반영은 URL이 바뀐 뒤 아래 effect가 setCurrentBoard로 한다 — 원본이 둘이 아니다.
 * - 부팅(마이그레이션)이 끝나기 전에는 열지 않는다. 이전 중 보드를 열면 빈/낡은
 *   문서를 읽는다(AC-12). 부팅이 끝나면 effect가 다시 돌아 URL의 보드를 연다.
 * - n5: URL의 보드가 로컬에 없으면 resolveBoardAccess가 먼저 판정한다. 열 수 없으면
 *   setCurrentBoard를 부르지 않고 카드로 안내한다 — 빈 보드 행을 만들지 않는다(AC-8).
 */
export function RouteBoardSync({ boardId }: { boardId: string }) {
  const router = useRouter();
  const bootstrapComplete = useWorkspace((s) => s.bootstrapComplete);
  const migrationPending = useWorkspace((s) => s.migrationPending);
  const [blocked, setBlocked] = useState<{
    boardId: string;
    access: Extract<BoardAccess, { kind: "not-found" | "no-access" | "offline" }>;
  } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setBoardNavigator((id) => router.push(`/b/${id}`));
    return () => setBoardNavigator(null);
  }, [router]);

  useEffect(() => {
    if (!bootstrapComplete || migrationPending) return;
    if (useWorkspace.getState().currentBoardId === boardId) return;
    let cancelled = false;
    void (async () => {
      const result = await resolveBoardAccess(boardId);
      if (cancelled) return;
      if (result.kind === "open" || result.kind === "shared") {
        setBlocked(null);
        void useWorkspace.getState().setCurrentBoard(boardId);
      } else {
        setBlocked({ boardId, access: result });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, bootstrapComplete, migrationPending, nonce]);

  if (blocked && blocked.boardId === boardId) {
    return (
      <BoardAccessCard
        access={blocked.access}
        onRetry={() => setNonce((n) => n + 1)}
      />
    );
  }
  return null;
}

/** `/`는 화면이 아니라 갈림길이다 (D4). 로그인했으면 마지막으로 연 보드로 replace한다.
 * 뒤로 가기에도 `/`가 남지 않는다(AC-6). 보드가 하나도 없을 때의 첫 보드 고르기는
 * n4 범위라 여기서는 아무것도 하지 않는다.
 */
export function RootBoardRedirect() {
  const router = useRouter();
  const bootstrapComplete = useWorkspace((s) => s.bootstrapComplete);
  const migrationPending = useWorkspace((s) => s.migrationPending);
  const boards = useWorkspace((s) => s.boards);

  useEffect(() => {
    if (!bootstrapComplete || migrationPending) return;
    const last = boards[0];
    if (!last) return;
    const target = `/b/${last.id}`;
    if (typeof window !== "undefined" && window.location.pathname === target) return;
    router.replace(target);
  }, [bootstrapComplete, migrationPending, boards, router]);

  return null;
}

/**
 * 워크스페이스 본문. `app/page.tsx`(갈림길)와 `app/b/[boardId]/page.tsx`(보드 주소)가
 * 공유한다. boardId가 없으면 `/` 갈림길로 동작한다.
 * 로그인 게이트는 이 안에서 캔버스를 감싼다 — 로그인 전에는 캔버스·Dock이 보이지 않는다.
 */
export function WorkspaceShell({ boardId }: { boardId?: string }) {
  const [signalsOpen, setSignalsOpen] = useState(false);
  return (
    // FEAT-sticky-redesign n8: 사이드바 DOM 제거 — 캔버스가 화면 왼쪽 끝부터 시작한다(AC-1).
    <main className="grid h-screen w-screen grid-cols-1 grid-rows-1">
      {/* FEAT-onboarding-routes n2: 세션 복원은 게이트 밖에서 항상 돈다. */}
      <AuthBootstrap />
      <WorkspaceGate>
        {boardId ? (
          <>
            <RouteBoardSync boardId={boardId} />
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
          </>
        ) : (
          <RootBoardRedirect />
        )}
      </WorkspaceGate>
    </main>
  );
}
