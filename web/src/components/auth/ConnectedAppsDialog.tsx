"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/Provider";
import { disconnectApp, listConnectedApps, type ConnectedApp } from "@/state/connectedApps";

/** remote-mcp n7 (T6) — 계정 메뉴의 "연결된 앱". 목록을 보고 해제하면 그 에이전트의 다음 호출이 막힌다. */
export function ConnectedAppsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listConnectedApps()
      .then((list) => {
        if (!cancelled) setApps(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const disconnect = async (id: string) => {
    setBusyId(id);
    setFailed(false);
    try {
      await disconnectApp(id);
      setApps((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    } catch {
      setFailed(true);
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (ms: number) => new Date(ms).toLocaleDateString();

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div aria-hidden className="absolute inset-0 backdrop-blur-md" style={{ background: "rgba(236,237,239,.35)" }} onClick={onClose} />
      <div
        role="dialog"
        aria-label={t("collab.apps.title")}
        className="relative w-[360px] rounded-[18px] bg-white/90 p-[26px_24px_20px] shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h3 className="mb-1 text-center text-[17px] font-semibold">{t("collab.apps.title")}</h3>
        <p className="text-center text-[12px] text-[#8e8e93]">{t("collab.apps.body")}</p>
        {apps && apps.length === 0 ? (
          <p className="mt-4 text-center text-[13px] text-[#8e8e93]">{t("collab.apps.empty")}</p>
        ) : null}
        <ul className="mt-4 max-h-[260px] overflow-y-auto">
          {(apps ?? []).map((app) => (
            <li key={app.id} className="flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{app.clientName}</div>
                <div className="text-[11px] text-[#8e8e93]">
                  {t("collab.apps.connectedAt", { date: fmt(app.createdAt) })}
                  {app.lastUsedAt ? ` · ${t("collab.apps.lastUsed", { date: fmt(app.lastUsedAt) })}` : ""}
                </div>
              </div>
              <button
                type="button"
                aria-label={t("collab.apps.disconnectNamed", { name: app.clientName })}
                disabled={busyId === app.id}
                onClick={() => void disconnect(app.id)}
                className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-[12px] disabled:opacity-60"
              >
                {t("collab.apps.disconnect")}
              </button>
            </li>
          ))}
        </ul>
        {failed ? (
          <p role="alert" className="mt-2 text-center text-[12px] text-red-600">
            {t("collab.apps.failed")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex w-full cursor-pointer items-center justify-center px-4 py-2 text-[12px] text-[#8e8e93]"
        >
          {t("collab.apps.close")}
        </button>
      </div>
    </div>
  );
}
