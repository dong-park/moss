/**
 * AI 데이터 프라이버시 게이트 — 순수 결정 함수.
 *
 * 모든 AI 외부 호출은 이 함수의 판정을 통과해야 한다 (FEAT-privacy AC-1, AC-2).
 * React/Zustand에 의존하지 않으므로 `node --test`로 진리표 검증 가능.
 *
 * 우선순위:
 *   global=true  → 항상 차단
 *   note=true    → 차단
 *   board=true   → 차단 (Phase 2 예약, 현재 always undefined)
 *   그 외        → 허용
 */
export interface AIGateContext {
  globalOptOut: boolean;
  noteOptOut: boolean;
  boardOptOut?: boolean;
}

export function canSendToAI(ctx: AIGateContext): boolean {
  if (ctx.globalOptOut) return false;
  if (ctx.noteOptOut) return false;
  if (ctx.boardOptOut) return false;
  return true;
}

export interface AINoteRef {
  id: string;
  title: string;
  aiOptOut: boolean;
}

export interface FilterResult {
  allowed: AINoteRef[];
  blocked: AINoteRef[];
  blockedAll: boolean;
}

export function filterNotesForAI(
  notes: AINoteRef[],
  globalOptOut: boolean,
): FilterResult {
  if (globalOptOut) {
    return { allowed: [], blocked: notes, blockedAll: true };
  }
  const allowed: AINoteRef[] = [];
  const blocked: AINoteRef[] = [];
  for (const n of notes) {
    if (canSendToAI({ globalOptOut: false, noteOptOut: n.aiOptOut })) {
      allowed.push(n);
    } else {
      blocked.push(n);
    }
  }
  return { allowed, blocked, blockedAll: false };
}
