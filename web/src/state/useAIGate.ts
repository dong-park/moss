"use client";

import { useCallback } from "react";
import { useWorkspace, type Card } from "./workspace";
import { useStorage } from "./storage";
import { filterNotesForAI, type AINoteRef } from "./aiGate";

/**
 * AI 외부 호출의 사용자-대면 진입점 (FEAT-privacy).
 *
 * 1. globalOptOut / noteOptOut을 필터로 차단 (네트워크 호출 자체 없음 — AC-1, AC-2)
 * 2. 통과 메모를 사용자에게 미리 보여 명시적 동의 받음 (AC-3)
 * 3. confirm 시 실제 송신 — 현재 mock. summary / connection-label endpoint는 Slice 2 도착 시 교체.
 *
 * **자동 임베딩 큐는 본 hook을 거치지 않는다** (`embeddingQueue.ts`).
 * 사용자가 보드를 채우는 동안 매번 모달이 뜨면 UX가 깨지므로,
 * 큐는 동일한 결정 함수 `filterNotesForAI`로 동일 차단 보장만 수행하고
 * confirm 모달은 manual 액션(요약·연결 라벨)에만 사용한다.
 *
 * pending 상태는 store에 있으므로 모달은 앱 최상위에서 한 번만 마운트한다.
 */

export type AICallReason = "embedding" | "summary" | "connection" | string;

export type AIGateOutcome =
  | { status: "sent"; sentNoteIds: string[] }
  | { status: "blocked-global" }
  | { status: "blocked-all-notes" }
  | { status: "cancelled" };

export interface UseAIGateResult {
  send: (notes: Card[], reason?: AICallReason) => Promise<AIGateOutcome>;
  blocked: boolean;
}

function toRef(card: Card): AINoteRef {
  return {
    id: card.id,
    title: card.content.split("\n")[0]?.slice(0, 40) || "(빈 메모)",
    aiOptOut: !!card.aiOptOut,
  };
}

export function useAIGate(): UseAIGateResult {
  const globalOptOut = useStorage(
    (s) => s.settings?.aiOptOutGlobal ?? false,
  );
  const setPending = useWorkspace((s) => s.setPendingAIGate);

  const send = useCallback(
    async (cards: Card[], reason: AICallReason = "embedding"): Promise<AIGateOutcome> => {
      if (globalOptOut) {
        return { status: "blocked-global" };
      }
      const refs = cards.map(toRef);
      const { allowed } = filterNotesForAI(refs, false);
      if (allowed.length === 0) {
        return { status: "blocked-all-notes" };
      }

      const confirmed = await new Promise<boolean>((resolve) => {
        setPending({ reason, notes: allowed, resolve });
      });
      setPending(null);

      if (!confirmed) return { status: "cancelled" };

      await mockSend(allowed);
      return { status: "sent", sentNoteIds: allowed.map((n) => n.id) };
    },
    [globalOptOut, setPending],
  );

  return { send, blocked: globalOptOut };
}

async function mockSend(notes: AINoteRef[]): Promise<void> {
  // summary / connection-label 등 manual reason은 Slice 2에서 fetch 연결.
  // 임베딩(reason='embedding')은 큐 경로(embeddingQueue.ts)가 자체 처리하므로
  // 이 경로로 들어오지 않는다.
  void notes;
  return Promise.resolve();
}
