import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

/**
 * FEAT-onboarding-routes n3 — 보드마다 UUID 주소 `/b/[boardId]` (D1·D2·D8).
 * URL이 보드 전환의 원본이다. WorkspaceShell이 `usePathname`에서 보드 id를 파싱해 연다.
 * 로그인하지 않았으면 게이트가 로그인 온보딩을 보여 주고, 로그인하면 이 주소의
 * 보드가 열린다(AC-4). P1: 보드 전환은 네이티브 history라 이 서버 페이지를 다시
 * 타지 않는다 — 첫 로드·링크 붙여넣기에서만 렌더된다.
 */
export default function BoardPage() {
  return <WorkspaceShell />;
}
