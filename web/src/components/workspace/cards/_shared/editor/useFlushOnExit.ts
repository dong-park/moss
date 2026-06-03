"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-autosave-guard (W1) — 종료 경로 flush 배선(유실 가드).
 *
 * P0 cardPersist의 flushCard/flushAll(디바운스 무시 즉시 기록)을 "에디터가 사라지는
 * 순간"에 호출해, 300ms 디바운스 창 안의 마지막 편집이 유실되는 것을 막는다.
 *
 *  - 카드/모달 언마운트       → flushCard(id)  : 해당 카드만 즉시 기록 (AC-1)
 *  - 탭 닫기(beforeunload)    → flushAll()     : 대기 중인 전부 동기 put (AC-2)
 *  - 백그라운드 전환(hidden)  → flushAll()     : 모바일 등 beforeunload 미발화 보강
 *
 * window/document 리스너는 **모듈 싱글톤 + 참조 카운트**로 단 한 벌만 단다(spec §6
 * "중복 리스너 금지"). 여러 메모가 동시에 열려도 핸들러는 하나뿐이고, 마지막 카드가
 * 언마운트될 때 깔끔히 제거된다. beforeunload는 페이지 종료를 막지 않는다(prompt 금지,
 * spec §8) — 이미 메모리에 있는 카드만 동기 put 한다.
 * ───────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import { flushAll, flushCard } from "@/state/cardPersist";

let refCount = 0;

function handleBeforeUnload(): void {
  // 반환값/preventDefault 없음 → 종료를 막지 않고 대기분만 동기 flush.
  void flushAll();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "hidden") void flushAll();
}

function acquireGlobalListeners(): void {
  if (refCount === 0 && typeof window !== "undefined") {
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  refCount += 1;
}

function releaseGlobalListeners(): void {
  refCount -= 1;
  if (refCount <= 0 && typeof window !== "undefined") {
    refCount = 0;
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
}

/** 에디터 수명 동안 종료 경로 flush를 보장한다. 언마운트 시 이 카드를 flush하고,
 *  살아있는 동안 탭 종료/백그라운드 전환에서 전체 flush를 건다(싱글톤 리스너). */
export function useFlushOnExit(cardId: string): void {
  useEffect(() => {
    acquireGlobalListeners();
    return () => {
      // 언마운트 = 디바운스 창 안일 수 있음 → 이 카드의 대기분 즉시 기록.
      void flushCard(cardId);
      releaseGlobalListeners();
    };
  }, [cardId]);
}

/** 테스트용 — 현재 싱글톤 리스너 참조 수. */
export function __listenerRefCount(): number {
  return refCount;
}
