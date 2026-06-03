/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-empty-cleanup (W7) — "한 번도 채워진 적 없음(never-filled)" 추적.
 *
 * deleteCardIfEmpty(workspace.ts)는 blur 시점의 카드만 본다 — 본문·overlay가 모두
 * 비어 있다는 사실만으로는 "처음부터 빈 카드"인지 "내용을 지운 카드"인지 구분할 수
 * 없다. 스펙 AC-3(데이터 보호 우선)은 후자를 보존하라고 못박으므로, 카드가 사는 동안
 * 한 번이라도 비공백 본문/overlay를 가진 적이 있는지를 store 구독으로 기록해 둔다.
 *
 * 설계 메모:
 *  - setContent/setOverlay는 W1·W9 공용 코드라 직접 건드리지 않는다 → store 구독으로 관찰.
 *  - 순환 초기화 회피: workspace.ts가 이 모듈을 import하므로, 구독 시작을 queueMicrotask로
 *    현재 동기 모듈 평가가 끝난 뒤(=useWorkspace 정의 후)로 미룬다.
 *  - 한 번 채워진 id는 영구 기억(지운 뒤에도 보존) → 거짓 양성 0 우선(스펙 §8).
 *  - cards 배열 레퍼런스 동일성으로 변경을 감지해 스캔을 cards-변경 때로만 한정한다.
 * ───────────────────────────────────────────────────────────── */

import { blocksToMarkdown, parseHandwriting } from "@/state/cardContent";
import type { Card } from "@/state/workspace";

/** startEmptyTracking이 필요로 하는 store 표면(구독·스냅샷)만 구조적으로 받는다.
 * 값 import 대신 주입으로 받아 workspace.ts와의 런타임 순환 의존을 없앤다. */
type CardStore = {
  getState: () => { cards: Card[] };
  subscribe: (listener: (s: { cards: Card[] }) => void) => () => void;
};

/** "한 번이라도 비공백 콘텐츠를 가졌던" 카드 id 집합. 삭제 후에도 비우지 않는다(forget 제외). */
const everFilled = new Set<string>();

/** overlay(펜)에 실제 획이 1개 이상 있으면 true. "" / `{"paths":[]}` 는 빈 것으로 본다. */
export function hasOverlayStrokes(overlay: string | undefined): boolean {
  if (!overlay) return false;
  return parseHandwriting(overlay).paths.length > 0;
}

/** 본문 markdown(레거시 블록 JSON 정규화 포함)이 공백뿐이 아니면 true. */
export function hasMemoText(content: string): boolean {
  return blocksToMarkdown(content).trim().length > 0;
}

/** 본문·overlay 둘 다 비었으면 true(= 표시상 완전히 빈 메모). */
export function isMemoEmpty(card: Pick<Card, "content" | "overlay">): boolean {
  return !hasMemoText(card.content) && !hasOverlayStrokes(card.overlay);
}

/** 카드가 지금 비공백 콘텐츠를 가졌으면 everFilled에 기록. */
function observe(card: Pick<Card, "id" | "content" | "overlay">): void {
  if (hasMemoText(card.content) || hasOverlayStrokes(card.overlay)) {
    everFilled.add(card.id);
  }
}

/** 이 카드가 생성 이후 한 번도 비공백 콘텐츠를 가진 적이 없으면 true. */
export function wasNeverFilled(id: string): boolean {
  return !everFilled.has(id);
}

/** 카드를 "채워졌음"으로 강제 표시 — undo 복원 시 즉시 재삭제 루프를 막는 데 쓴다. */
export function markFilled(id: string): void {
  everFilled.add(id);
}

/** 삭제 확정된 카드의 추적을 잊는다(메모리 정리). */
export function forgetCard(id: string): void {
  everFilled.delete(id);
}

/** 테스트 격리용 — 추적 상태 초기화. */
export function __resetEmptyTracking(): void {
  everFilled.clear();
}

let started = false;
let lastCards: Card[] | undefined;

/**
 * cards 변경마다 비공백 카드를 everFilled에 누적한다. 멱등(중복 구독 방지).
 * workspace.ts가 store 생성 직후 자기 store를 주입해 한 번 호출한다 — 순환 의존
 * 없이 useWorkspace 정의 이후 시점이 보장된다.
 */
export function startEmptyTracking(store: CardStore): void {
  if (started) return;
  started = true;
  const scan = (cards: Card[]) => {
    if (cards === lastCards) return;
    lastCards = cards;
    for (const c of cards) observe(c);
  };
  // 구독 직전의 현재 카드(이미 로드된 채워진 카드)도 즉시 기록.
  scan(store.getState().cards);
  store.subscribe((s) => scan(s.cards));
}
