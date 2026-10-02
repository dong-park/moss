"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Canvas } from "@/components/workspace/Canvas";
import { MemoTable } from "@/components/workspace/table/MemoTable";
import { ViewToggle } from "@/components/workspace/table/ViewToggle";
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
import { AccountMenu } from "@/components/auth/AccountMenu";
import { OfflineBadge } from "@/components/presence/OfflineBadge";
import { FirstBoardChooser } from "./FirstBoardChooser";
import { needsFirstBoard, setBoardNavigator, useWorkspace } from "@/state/workspace";
import {
  resolveBoardAccess,
  type BoardAccess,
} from "@/state/boardAccess";
import { BoardAccessCard } from "./BoardAccessCard";

/** `/b/<id>` 경로에서 보드 id를 뽑는다. `/`거나 그 밖의 경로면 undefined. */
export function parseBoardId(pathname: string | null | undefined): string | undefined {
  if (!pathname) return undefined;
  const match = /^\/b\/([^/]+)\/?$/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/** 보드 주소(`/b/[boardId]`)를 보드 전환의 원본으로 잇는 배선 (n3 D8).
 *
 * - 스토어의 보드 전환 요청(navigateToBoard)이 오면 네이티브 history.pushState로 URL을
 *   바꾼다. Next 16은 네이티브 history 호출을 `usePathname`과 동기화하므로 RSC 왕복 없이
 *   경로가 바뀌고, 오프라인에서도 이동한다(P1). 상태 반영은 새 boardId가 내려온 뒤
 *   아래 effect가 setCurrentBoard로 한다 — 원본이 둘이 아니다.
 * - 부팅(마이그레이션)이 끝나기 전에는 열지 않는다. 이전 중 보드를 열면 빈/낡은
 *   문서를 읽는다(AC-12). 부팅이 끝나면 effect가 다시 돌아 URL의 보드를 연다.
 * - n5: URL의 보드가 로컬에 없으면 resolveBoardAccess가 먼저 판정한다. 열 수 없으면
 *   setCurrentBoard를 부르지 않고 카드로 안내한다 — 빈 보드 행을 만들지 않는다(AC-8).
 */
export function RouteBoardSync({ boardId }: { boardId: string }) {
  const bootstrapComplete = useWorkspace((s) => s.bootstrapComplete);
  const migrationPending = useWorkspace((s) => s.migrationPending);
  const [blocked, setBlocked] = useState<{
    boardId: string;
    access: Extract<BoardAccess, { kind: "not-found" | "no-access" | "offline" }>;
  } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setBoardNavigator((id) => {
      if (typeof window === "undefined") return;
      const target = `/b/${id}`;
      if (window.location.pathname === target) return;
      window.history.pushState(null, "", target);
    });
    return () => setBoardNavigator(null);
  }, []);

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
 * 뒤로 가기에도 `/`가 남지 않는다(AC-6). 사용자 보드가 하나도 없으면 첫 보드 고르기
 * 화면을 보여 준다(n4 D5-1, AC-5) — 기존 사용자는 시스템 보드 메모가 있어 뜨지 않는다(AC-7).
 * P1: `router.replace` 대신 네이티브 replaceState — RSC 왕복과 워크스페이스 재마운트를 없앤다.
 */
export function RootBoardRedirect() {
  const bootstrapComplete = useWorkspace((s) => s.bootstrapComplete);
  const migrationPending = useWorkspace((s) => s.migrationPending);
  const boards = useWorkspace((s) => s.boards);
  const cards = useWorkspace((s) => s.cards);

  const firstBoardNeeded =
    bootstrapComplete && !migrationPending && needsFirstBoard(boards, cards);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!bootstrapComplete || migrationPending) return;
    // 첫 보드 고르기 화면이 떠 있으면 마지막 보드로 보내지 않는다.
    if (needsFirstBoard(boards, cards)) return;
    const last = boards[0];
    if (!last) return;
    const target = `/b/${last.id}`;
    if (window.location.pathname === target) return;
    window.history.replaceState(null, "", target);
  }, [bootstrapComplete, migrationPending, boards, cards]);

  if (firstBoardNeeded) return <FirstBoardChooser />;
  return null;
}

/**
 * 주소에서 보드 id를 구독한다. Next가 네이티브 history·popstate를 pathname에 반영하면
 * 그 값을 따르고, 반영이 늦거나 빠지는 환경을 위해 popstate 리스너로 `window.location`을
 * 한 번 더 읽는다(안전망). 뒤로/앞으로가 주소를 바꾸면 이 훅이 boardId를 갱신한다.
 */
export function useBoardIdFromPath(): string | undefined {
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  const [boardId, setBoardId] = useState(() => parseBoardId(pathname));

  // pathname이 바뀌면 렌더 중 파생 상태를 맞춘다 — effect에서 setState하지 않는다.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setBoardId(parseBoardId(pathname));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => setBoardId(parseBoardId(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return boardId;
}

/**
 * 워크스페이스 본문. `app/page.tsx`(갈림길)와 `app/b/[boardId]/page.tsx`(보드 주소)가
 * 공유한다. 보드 주소를 prop이 아니라 `usePathname`에서 파싱한다 — 네이티브 history로
 * 바뀐 경로도 서버 페이지 prop 재전달 없이 그대로 반영된다(P1, 오프라인 이동).
 * 경로에 보드 id가 없으면 `/` 갈림길(RootBoardRedirect)로 동작한다.
 * 로그인 게이트는 이 안에서 캔버스를 감싼다 — 로그인 전에는 캔버스·Dock이 보이지 않는다.
 */
export function WorkspaceShell() {
  const boardId = useBoardIdFromPath();
  const [signalsOpen, setSignalsOpen] = useState(false);
  // FEAT-memo-table-view: 캔버스 ↔ 표. 표 모드에선 Canvas·Dock·캔버스 단축키를
  // 숨긴다(spec §4 — 표에서 캔버스 단축키가 먹지 않게).
  const isCanvas = useWorkspace((s) => s.view) === "canvas";

  return (
    // FEAT-sticky-redesign n8: 사이드바 DOM 제거 — 캔버스가 화면 왼쪽 끝부터 시작한다(AC-1).
    <main className="grid h-screen w-screen grid-cols-1 grid-rows-1">
      {/* FEAT-onboarding-routes n2: 세션 복원은 게이트 밖에서 항상 돈다. */}
      <AuthBootstrap />
      <WorkspaceGate>
        {boardId ? (
          <>
            <RouteBoardSync boardId={boardId} />
            {isCanvas ? <Canvas /> : <MemoTable />}
            {/* FEAT-collab-auth n7: 우상단 오프라인 표시 + 공유 아이콘.
                FEAT-memo-table-view AC-1: 캔버스 ↔ 표 토글도 같은 줄에 둔다. */}
            <div className="fixed top-3 right-3 z-[var(--z-panel)] flex items-center gap-2">
              <OfflineBadge />
              <ShareControlMount />
              <ViewToggle />
              <AccountMenu />
            </div>
            <CollabSession />
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
            <AuthSessionOverlay />
          </>
        ) : (
          <RootBoardRedirect />
        )}
      </WorkspaceGate>
    </main>
  );
}
