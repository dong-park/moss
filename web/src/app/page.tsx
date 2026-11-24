"use client";

import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

/**
 * FEAT-onboarding-routes n3 — `/`는 화면이 아니라 갈림길이다 (D4).
 * 로그인 여부와 상관없이 RootBoardRedirect가 마지막으로 연 보드의 `/b/[boardId]`로
 * replace한다(AC-6). 처음이면 첫 벽을 연다 — 로그인 분기는 없다(local-promise D7).
 */
export default function RootPage() {
  return <WorkspaceShell />;
}
