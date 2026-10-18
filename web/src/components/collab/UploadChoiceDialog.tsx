"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/Provider";
import { resolveLocalOwner } from "@/components/auth/AccountOwnerGuard";
import { useAuth } from "@/state/auth";
import type { Board } from "@/state/db/schema";
import { finishUploadChoice, prepareUploadChoice } from "@/state/membership";
import { useStorage } from "@/state/storage";

/**
 * remote-mcp n1 (D1) — 처음 로그인한 계정에게 "서버에 올릴 보드"를 한 번 고르게 한다.
 * 고른 보드만 서버에 저장되고, 고르지 않은 보드는 이 기기에만 남는다(로그아웃해도 로컬 사본은 그대로).
 * 기본은 아무것도 고르지 않은 상태다 — 묻지 않고 개인 메모가 올라가지 않게 한다.
 * 고르기가 끝난 뒤 만든 보드는 로그인 상태에서 자동으로 서버에 저장된다.
 */
export function UploadChoiceDialog() {
  const t = useT();
  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.user?.id ?? null);
  const initialized = useStorage((s) => s.initialized);
  const ownerId = useStorage((s) => s.settings?.ownerUserId ?? null);
  const settingsLoaded = useStorage((s) => s.settings !== null && s.settings !== undefined);

  const [choice, setChoice] = useState<{ boards: Board[]; since: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // 다른 계정의 보드가 남은 기기는 올리지 않는다 — AccountOwnerGuard가 먼저 안내한다.
  const eligible =
    status === "authenticated" &&
    userId !== null &&
    initialized &&
    settingsLoaded &&
    resolveLocalOwner(ownerId, userId) === "match";

  useEffect(() => {
    if (!eligible || !userId) return;
    let cancelled = false;
    void prepareUploadChoice(userId)
      .then((next) => {
        if (!cancelled && next) setChoice(next);
      })
      .catch(() => {
        /* 오프라인 — 다음 로그인·앱 시작에 다시 묻는다 */
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, userId]);

  if (!choice || !userId) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (ids: string[]) => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await finishUploadChoice(userId, choice.since, ids);
      if (result.failed.length > 0) {
        setFailed(true);
        return;
      }
      setChoice(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: "rgba(236,237,239,.35)" }}
      />
      <div
        role="dialog"
        aria-label={t("collab.upload.title")}
        className="relative w-[340px] rounded-[18px] bg-white/85 p-[26px_24px_20px] shadow-[0_12px_40px_rgba(0,0,0,.08),0_0_0_.5px_rgba(0,0,0,.05)]"
      >
        <h3 className="mb-1 text-center text-[17px] font-semibold">{t("collab.upload.title")}</h3>
        <p className="text-center text-[12px] text-[#8e8e93]">{t("collab.upload.body")}</p>
        <ul className="mt-4 max-h-[240px] overflow-y-auto">
          {choice.boards.map((board) => (
            <li key={board.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={selected.has(board.id)}
                  onChange={() => toggle(board.id)}
                  disabled={busy}
                />
                <span className="truncate">
                  {board.name.trim() === "" ? t("cards.board.unnamed") : board.name}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {failed ? (
          <p role="alert" className="mt-2 text-center text-[12px] text-red-600">
            {t("collab.upload.failed")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void submit([...selected])}
          disabled={busy || selected.size === 0}
          className="mt-4 flex w-full cursor-pointer items-center justify-center rounded-[10px] bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
        >
          {t("collab.upload.confirm")}
        </button>
        <button
          type="button"
          onClick={() => void submit([])}
          disabled={busy}
          className="mt-2 flex w-full cursor-pointer items-center justify-center px-4 py-2 text-[12px] text-[#8e8e93] disabled:opacity-60"
        >
          {t("collab.upload.skip")}
        </button>
      </div>
    </div>
  );
}
