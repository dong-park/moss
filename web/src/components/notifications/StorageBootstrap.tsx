"use client";

import { useEffect } from "react";
import { useStorage } from "@/state/storage";
import { useQuotaWatcher } from "@/state/quota-watcher";
import { useWorkspace } from "@/state/workspace";
import { startMossBridge } from "@/state/bridge/mossBridge";

/**
 * 앱 진입 시 storage init + workspace 로드 + quota 폴링을 시작한다.
 * NEXT_PUBLIC_MOSS_BRIDGE=1 이면 외부 MCP용 데이터 브리지도 함께 연다(멱등·게이트).
 */
export function StorageBootstrap() {
  const initialized = useStorage((s) => s.initialized);
  const init = useStorage((s) => s.init);
  const loadFromStorage = useWorkspace((s) => s.loadFromStorage);

  useEffect(() => {
    if (initialized) return;
    void (async () => {
      await init();
      await loadFromStorage();
      startMossBridge();
    })();
  }, [initialized, init, loadFromStorage]);

  useQuotaWatcher();
  return null;
}
