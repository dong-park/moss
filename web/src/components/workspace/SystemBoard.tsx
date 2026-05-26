"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/state/workspace";
import { computeNowStayingCards } from "@/state/selectors/systemBoard";
import { NowStayingCard } from "./cards/NowStayingCard";

/**
 * FEAT-home — 시스템 보드 큐레이팅 레이어.
 * Canvas 안에 viewport-독립 absolute 레이어로 렌더된다 (캔버스 zoom/pan 영향 없음).
 *
 * MVP 범위:
 * - "지금 머무는 생각" 카드만 휴리스틱(lastVisitedAt + 첫 어절)으로 산출
 * - 결과 0개면 아무것도 렌더하지 않음 (사용자 카드만 보임)
 *
 * Iteration 2 도착 예정 (AI pipeline Slice 2 이후):
 * - 다시 떠오른 생각 / 오늘의 연결 / 사고 흐름 타임라인
 */
export function SystemBoard() {
  const cards = useWorkspace((s) => s.cards);

  // 진입 시 1회 계산 — spec §8: 시스템 보드 진입 → 렌더링 < 500ms.
  // cards 참조가 바뀔 때만 재계산. 카드 단순 이동(moveCard)도 cards 배열을 새로
  // 만들어 useMemo가 재실행되지만, 휴리스틱이 단순해 비용은 무시 가능.
  const items = useMemo(() => computeNowStayingCards(cards), [cards]);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="system-board"
      aria-label="시스템 보드 큐레이팅"
      className="pointer-events-none absolute left-6 top-20 z-[var(--z-panel)] flex flex-wrap gap-3"
      style={{ maxWidth: "calc(100% - 96px)" }}
    >
      {items.map((item) => (
        <div key={item.theme} className="pointer-events-auto">
          <NowStayingCard item={item} />
        </div>
      ))}
    </div>
  );
}
