"use client";

import { useEffect } from "react";
import { useStorage } from "@/state/storage";
import { useQuotaWatcher } from "@/state/quota-watcher";
import { useWorkspace } from "@/state/workspace";

/**
 * 앱 진입 시 storage init + workspace 로드 + quota 폴링을 시작한다.
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
    })();
  }, [initialized, init, loadFromStorage]);

  useQuotaWatcher();
  return null;
}
