"use client";

import { useEffect } from "react";
import { useAuth } from "@/state/auth";

/**
 * 저장된 세션을 한 번 복원한다. 세션이 없으면 네트워크 0건 (AC-1).
 * 액세스 토큰만 만료됐으면 여기서 조용히 갱신된다.
 */
export function AuthBootstrap() {
  useEffect(() => {
    void useAuth.getState().hydrate();
  }, []);
  return null;
}
