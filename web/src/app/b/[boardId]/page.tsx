import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

/**
 * FEAT-onboarding-routes n3 — 보드마다 UUID 주소 `/b/[boardId]` (D1·D2·D8).
 * URL이 보드 전환의 원본이다. RouteBoardSync가 이 주소를 읽어 보드를 연다.
 * 로그인하지 않았으면 게이트가 로그인 온보딩을 보여 주고, 로그인하면 이 주소의
 * 보드가 열린다(AC-4).
 */
export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  return <WorkspaceShell boardId={boardId} />;
}
