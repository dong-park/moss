"use client";

import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { getDB, type Note } from "@/state/db/schema";
import { useStorage } from "@/state/storage";
import { extractKeywords } from "./extractKeywords";
import { buildRhythm } from "./buildRhythm";
import type { SignalsState } from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_NOTES = 10;

/**
 * 최근 7일 메모를 Dexie liveQuery로 구독하여 SignalsState를 반환.
 * - aiOptOutGlobal === true → status: 'opt-out'
 * - 노트별 aiOptOut === true → 집계에서 제외
 * - notes.length < 10 → status: 'empty'
 * - 그 외 → keywords + rhythm 계산
 */
export function useSignals(enabled: boolean): SignalsState {
  const aiOptOutGlobal = useStorage(
    (s) => s.settings?.aiOptOutGlobal ?? false,
  );
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    // disabled/opt-out이면 구독하지 않는다. 아래 useMemo가 enabled를 직접 보고
    // 'empty'를 반환하므로 stale notes를 effect 본문에서 동기 setState로 지울
    // 필요가 없다(react-hooks/set-state-in-effect 회피).
    if (!enabled || aiOptOutGlobal) return;
    const obs = liveQuery(async () => {
      const cutoff = Date.now() - SEVEN_DAYS_MS;
      return getDB()
        .notes.where("createdAt")
        .above(cutoff)
        .filter((n) => !n.aiOptOut)
        .toArray();
    });
    const sub = obs.subscribe({
      next: (rows) => setNotes(rows),
      error: () => setNotes([]),
    });
    return () => sub.unsubscribe();
  }, [enabled, aiOptOutGlobal]);

  return useMemo<SignalsState>(() => {
    if (aiOptOutGlobal) return { status: "opt-out" };
    if (!enabled || notes === null) return { status: "empty", total: 0 };
    if (notes.length < MIN_NOTES) {
      return { status: "empty", total: notes.length };
    }
    return {
      status: "ready",
      total: notes.length,
      keywords: extractKeywords(notes),
      rhythm: buildRhythm(notes),
    };
  }, [enabled, aiOptOutGlobal, notes]);
}
