"use client";

import { useAuth } from "@/state/auth";
import { AccountOwnerGuard } from "./AccountOwnerGuard";

/**
 * 워크스페이스를 로그인 여부와 상관없이 연다 (local-promise D7, 원래 collab-auth D8
 * "혼자 쓸 때는 로그인 없음"). 세션 복원(AuthBootstrap)은 뒤에서 조용히 돌고, 복원 전이든
 * anonymous로 끝나든 화면은 기다리지 않는다 — 로그인은 공유·초대 순간에만 묻는다.
 *
 * 다른 계정 안내(AccountOwnerGuard)만 로그인 상태일 때 붙인다. 만료 카드는
 * `AuthSessionOverlay`가, 초대 카드는 `InviteRoute`가 따로 맡는다.
 */
export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);

  return (
    <>
      {status === "authenticated" ? <AccountOwnerGuard /> : null}
      {children}
    </>
  );
}
