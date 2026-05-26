"use client";

import { useStorage } from "@/state/storage";
import { LockIcon } from "@/components/icons";
import { useT } from "@/i18n/Provider";

/**
 * 전역 AI 옵트아웃 토글 (FEAT-privacy AC-2).
 *
 * 설정 화면이 아직 없어 임시 노출이 필요할 때 어디든 갖다 써도 동작.
 * 톤: 잔잔, 자물쇠 회색.
 */
export function AIOptOutSettingsRow() {
  const t = useT();
  const aiOptOutGlobal = useStorage(
    (s) => s.settings?.aiOptOutGlobal ?? false,
  );
  const updateSettings = useStorage((s) => s.updateSettings);
  const toggle = () => updateSettings({ aiOptOutGlobal: !aiOptOutGlobal });

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md p-3 transition-colors hover:bg-panel">
      <span className="mt-0.5 text-text-soft">
        <LockIcon size={16} />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] font-medium text-text">
          {t("privacy.global.title")}
        </span>
        <span className="mt-0.5 block text-[12px] leading-5 text-text-muted">
          {t("privacy.global.description")}
        </span>
      </span>
      <input
        type="checkbox"
        checked={aiOptOutGlobal}
        onChange={toggle}
        aria-label={t("privacy.global.toggleLabel")}
        className="mt-1 h-4 w-4 cursor-pointer accent-[var(--color-text)]"
      />
    </label>
  );
}
