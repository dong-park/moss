"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-autosave-guard (W1) — 저장 상태 마이크로 스토어.
 *
 * "저장 중…/저장됨/저장 실패"를 카드별로 추적하는 UI 전용 싱글톤(persist 안 함,
 * spec §5). 버블 store(extensions.ts)와 같은 useSyncExternalStore 패턴.
 *
 * 흐름(spec §3 AC-3·AC-4):
 *   타이핑 → reportChange(id) → "saving"
 *     → (debounce 후) flushCard(id) : 디바운스 창 밖이면 no-op, 안이면 실제 put
 *       → resolve → "saved" → 1.5s 후 "idle"(페이드 종료)
 *       → reject  → console.warn + "error" 유지(silent 금지)
 *
 * flush 디바운스(250ms)는 workspace persist 디바운스(cardPersist DEBOUNCE_MS=300)
 * **보다 짧게** 잡는다. 그래야 대기 중인 실제 saveNote run을 flushCard가 붙잡아
 * 그 Promise를 await → "저장됨"이 IndexedDB 기록 완료를 진짜로 반영한다(300이 먼저
 * 터지면 자동 실행돼 Promise를 놓치고 낙관적 "저장됨"이 됨).
 * ───────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
import { flushCard } from "@/state/cardPersist";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** workspace 디바운스(300ms)보다 짧게 — 대기 중인 실제 put을 붙잡아 await. */
const FLUSH_DEBOUNCE_MS = 250;
/** "저장됨" 노출 후 사라지기까지(spec §3 AC-3). */
const SAVED_FADE_MS = 1500;

const states = new Map<string, SaveState>();
const subscribers = new Map<string, Set<() => void>>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const fadeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(id: string): void {
  subscribers.get(id)?.forEach((fn) => fn());
}

function setState(id: string, next: SaveState): void {
  if (states.get(id) === next) return;
  states.set(id, next);
  emit(id);
}

function clearTimer(map: Map<string, ReturnType<typeof setTimeout>>, id: string): void {
  const handle = map.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    map.delete(id);
  }
}

export function getSaveState(id: string): SaveState {
  return states.get(id) ?? "idle";
}

/** 편집 발생 보고 — "저장 중…"으로 두고, 디바운스 뒤 flush 결과로 전이한다. */
export function reportChange(id: string): void {
  clearTimer(fadeTimers, id); // 직전 "저장됨" 페이드 취소(연속 타이핑)
  clearTimer(flushTimers, id);
  setState(id, "saving");

  const handle = setTimeout(() => {
    flushTimers.delete(id);
    flushCard(id).then(
      () => {
        setState(id, "saved");
        const fade = setTimeout(() => {
          fadeTimers.delete(id);
          setState(id, "idle");
        }, SAVED_FADE_MS);
        fadeTimers.set(id, fade);
      },
      (err: unknown) => {
        // silent 금지(spec §3 AC-4) — 경고 + "저장 실패" 유지.
        console.warn(`[memo] 카드 저장 실패: ${id}`, err);
        setState(id, "error");
      },
    );
  }, FLUSH_DEBOUNCE_MS);
  flushTimers.set(id, handle);
}

function subscribe(id: string, cb: () => void): () => void {
  let set = subscribers.get(id);
  if (!set) {
    set = new Set();
    subscribers.set(id, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) subscribers.delete(id);
  };
}

/** 카드별 저장 상태 구독(SSR 스냅샷은 항상 idle). */
export function useSaveState(id: string): SaveState {
  return useSyncExternalStore(
    (cb) => subscribe(id, cb),
    () => getSaveState(id),
    () => "idle",
  );
}

/** 테스트용 — 모든 카드 상태·타이머 초기화. */
export function __resetSaveState(): void {
  flushTimers.forEach((h) => clearTimeout(h));
  fadeTimers.forEach((h) => clearTimeout(h));
  flushTimers.clear();
  fadeTimers.clear();
  states.clear();
  subscribers.clear();
}
