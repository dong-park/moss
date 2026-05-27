import type { Card } from "@/state/workspace";

/**
 * FEAT-memo-expand: 펼치기(확대) 모달을 지원하는 카드 종류의 단일 소스.
 *
 * 더블클릭 진입(DraggableCard.onDoubleClick)과 펼치기 버튼 노출이 모두 이 집합을
 * 참조한다. 새 타입을 확대 지원하려면 (1) 여기에 kind를 추가하고 (2) MemoExpandDialog가
 * 그 콘텐츠를 렌더하도록 확장하면, 더블클릭·버튼 노출이 자동으로 따라온다.
 */
export const EXPANDABLE_KINDS = new Set<Card["kind"]>(["text"]);

export const isExpandable = (card: Card): boolean =>
  EXPANDABLE_KINDS.has(card.kind);
