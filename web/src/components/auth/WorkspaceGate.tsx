"use client";

import { useState } from "react";
import type { AuthStatus } from "@/state/auth";
import { useAuth } from "@/state/auth";
import { AccountOwnerGuard } from "./AccountOwnerGuard";
import { LoginOnboarding } from "./LoginOnboarding";

/**
 * 세션 복원(AuthBootstrap)이 끝난 뒤에만 워크스페이스를 보여 준다 (D4/D5, AC-4).
 * - 저장된 세션이 복원됐으면(authenticated·expired) 곧바로 워크스페이스를 연다.
 *   D5-3: 오프라인에서 토큰 갱신이 실패해 `hydrated`가 서지 않아도, 이 기기에
 *   로그인 이력이 있으면 계속 쓴다. refresh 실패가 401이면 expired가 되어 카드가 뜬다.
 * - 아직 복원 전(anonymous·!hydrated): 빈 화면 — 온보딩이 깜빡이지 않게.
 * - 복원이 끝난 anonymous: 로그인 온보딩만.
 */
export type GateView = "loading" | "onboarding" | "workspace";

export function gateView(status: AuthStatus, hydrated: boolean): GateView {
  if (status === "authenticated" || status === "expired") return "workspace";
  if (!hydrated) return "loading";
  return "onboarding";
}

/**
 * `?next=`를 사이트 내부 경로로만 제한한다. 오픈 리다이렉트 방지 —
 * `//evil.com`·`https://evil.com` 같은 외부 주소는 버리고 undefined를 돌려준다.
 */
export function safeNextPath(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

function readNext(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const hydrated = useAuth((s) => s.hydrated);
  const [next] = useState(readNext);

  const view = gateView(status, hydrated);
  if (view === "loading") return null;
  if (view === "onboarding") return <LoginOnboarding next={next} />;
  return (
    <>
      <AccountOwnerGuard />
      {children}
    </>
  );
}
