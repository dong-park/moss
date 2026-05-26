"use client";

import { useEffect, useRef } from "react";
import { useStorage } from "@/state/storage";
import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";

const POLL_MS = 5 * 60 * 1000; // 5분 (spec §6)

/**
 * 80%·95% 임계 도달 시 settings.storageQuotaShown 플래그로 1회만 토스트.
 * 한 번 표시한 임계는 settings에 영속되어 새 세션에서도 재표시 안 함.
 */
export function useQuotaWatcher() {
  const initialized = useStorage((s) => s.initialized);
  const quota = useStorage((s) => s.quota);
  const settings = useStorage((s) => s.settings);
  const refreshQuota = useStorage((s) => s.refreshQuota);
  const updateSettings = useStorage((s) => s.updateSettings);
  const push = useToasts((s) => s.push);
  const t = useT();

  // updateSettings는 비동기 — 같은 세션 안에서 토스트가 중복 발사되지 않도록
  // 즉시 잠그는 ref. 영속은 settings.storageQuotaShown이 담당.
  const firedRef = useRef({ at80: false, at95: false });

  useEffect(() => {
    if (!initialized) return;
    refreshQuota();
    const interval = window.setInterval(() => {
      refreshQuota();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [initialized, refreshQuota]);

  useEffect(() => {
    if (!quota || !settings) return;
    const pct = quota.pct;
    const shown = settings.storageQuotaShown;

    if (pct >= 0.95 && !shown.at95 && !firedRef.current.at95) {
      // 95% 도달 시 80%도 함께 표시된 것으로 간주 — 두 토스트 동시 노출 방지.
      firedRef.current.at95 = true;
      firedRef.current.at80 = true;
      push({
        tone: "warn",
        title: t("storage.quota.at95.title"),
        body: t("storage.quota.at95.body"),
        duration: 0,
      });
      updateSettings({
        storageQuotaShown: { at80: true, at95: true },
      });
    } else if (pct >= 0.8 && !shown.at80 && !firedRef.current.at80) {
      firedRef.current.at80 = true;
      push({
        tone: "calm",
        title: t("storage.quota.at80.title"),
        body: t("storage.quota.at80.body", { pct: Math.round(pct * 100) }),
      });
      updateSettings({ storageQuotaShown: { ...shown, at80: true } });
    }
  }, [quota, settings, push, updateSettings, t]);
}
