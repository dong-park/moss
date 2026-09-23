"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import type { TrashEntry } from "@/state/db/schema";
import { plainText } from "@/state/memoSearch";
import { useT } from "@/i18n/Provider";

/** spec §7: 폭 320px, 높이는 뷰포트의 60%까지, 독 위로 뜨는 카드. */
const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT_RATIO = 0.6;
/** 독(bottomMargin 20 + height 56) 위 여백 12px. */
const DOCK_CLEARANCE_PX = 88;
const SNIPPET_LEN = 40;
/** 행마다 Intl 포맷터를 새로 만들지 않게 하나만 둔다. */
const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

/** 제목이 있으면 제목, 없으면 본문 첫 줄 40자. */
function entryLabel(entry: TrashEntry): string {
  const title = entry.note.title?.trim();
  if (title) return title;
  return plainText(entry.note.content).slice(0, SNIPPET_LEN);
}

function RestoreIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 14 4 9l5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h10a6 6 0 0 1 0 12h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PurgeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * FEAT-trash §6·§7: 독 옆 휴지통 패널.
 * Canvas 오버레이 레이어에 한 줄로 마운트된다(MemoSearchLayer와 동일 패턴).
 * 열릴 때와 복구·영구 삭제 뒤 listTrash를 다시 조회한다.
 */
export function TrashPanel() {
  const t = useT();
  const open = useWorkspace((s) => s.trashOpen);
  const setTrashOpen = useWorkspace((s) => s.setTrashOpen);
  const restoreFromTrash = useWorkspace((s) => s.restoreFromTrash);
  const refreshTrashCount = useWorkspace((s) => s.refreshTrashCount);
  // FEAT-trash-drag: 패널이 열린 채로 드롭해도 목록이 맞게 — 삭제가 일어나면 이 값이
  // 바뀌고 아래 effect가 재조회한다.
  const trashCount = useWorkspace((s) => s.trashCount);
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 본문 파싱은 목록이 바뀔 때만 — 렌더마다 1,000행을 다시 파싱하지 않게.
  // ponytail: 가상화 없음. 휴지통이 수천 건으로 늘면 useVirtualizedCards 패턴으로.
  const labels = useMemo(
    () => new Map(entries.map((e) => [e.id, entryLabel(e)])),
    [entries],
  );

  const reload = useCallback(async () => {
    const storage = useStorage.getState();
    if (!storage.initialized) await storage.init();
    setEntries(await storage.listTrash());
    await refreshTrashCount();
  }, [refreshTrashCount]);

  useEffect(() => {
    // 패널이 열리는 외부 신호 → DB 재조회. effect 안 setState가 정당한 use case.
    // FEAT-trash-drag: 열린 채 드롭으로 trashCount가 바뀌어도 재조회한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void reload();
  }, [open, trashCount, reload]);

  // Esc·바깥 클릭으로 닫기(spec §7).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrashOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setTrashOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, setTrashOpen]);

  if (!open) return null;

  const handleRestore = async (id: string) => {
    // 목록 재조회는 trashCount 변화를 받은 effect가 한 번만 한다.
    await restoreFromTrash(id);
  };

  const handlePurge = async (id: string) => {
    await useStorage.getState().purgeTrash([id]);
    await refreshTrashCount();
  };

  const handleEmpty = async () => {
    if (entries.length === 0) return;
    const ok = window.confirm(
      t("workspace.trash.confirmEmpty", { count: entries.length }),
    );
    if (!ok) return;
    // 확인한 N개만 지운다 — 패널을 연 뒤 새로 들어온 메모까지 지우지 않게.
    await useStorage.getState().purgeTrash(entries.map((e) => e.id));
    await refreshTrashCount();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("workspace.trash.title")}
      className="absolute left-1/2 z-[var(--z-panel)] flex -translate-x-1/2 flex-col rounded-xl border border-border p-2"
      style={{
        bottom: DOCK_CLEARANCE_PX,
        width: PANEL_WIDTH,
        maxHeight: `${Math.round(window.innerHeight * PANEL_MAX_HEIGHT_RATIO)}px`,
        background: "var(--gradient-paper)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-sm font-medium text-text">
          {t("workspace.trash.title")}
        </span>
        <button
          type="button"
          onClick={() => void handleEmpty()}
          disabled={entries.length === 0}
          className="cursor-pointer rounded-md px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-panel disabled:cursor-default disabled:opacity-40"
        >
          {t("workspace.trash.emptyAll")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-text-soft">
            {t("workspace.trash.empty")}
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text">
                  {labels.get(entry.id) || "—"}
                </div>
                <div className="truncate text-[11px] text-text-muted">
                  {entry.note.boardId === null
                    ? t("workspace.boardPicker.system")
                    : (entry.boardName ??
                      t("workspace.trash.deletedBoard"))}{" "}
                  · {DATE_FMT.format(entry.deletedAt)}
                </div>
              </div>
              <button
                type="button"
                aria-label={t("workspace.trash.restore")}
                title={t("workspace.trash.restore")}
                onClick={() => void handleRestore(entry.id)}
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text"
              >
                <RestoreIcon />
              </button>
              <button
                type="button"
                aria-label={t("workspace.trash.purge")}
                title={t("workspace.trash.purge")}
                onClick={() => void handlePurge(entry.id)}
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text"
              >
                <PurgeIcon />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
