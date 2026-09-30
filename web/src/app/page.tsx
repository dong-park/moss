"use client";

import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

/**
 * FEAT-onboarding-routes n3 — `/`는 화면이 아니라 갈림길이다 (D4).
 * 로그인 전이면 WorkspaceShell 안의 게이트가 로그인 온보딩을 보여 주고(AC-4),
 * 로그인했으면 RootBoardRedirect가 마지막으로 연 보드의 `/b/[boardId]`로 replace한다(AC-6).
 */
export default function RootPage() {
  return <WorkspaceShell />;
}
