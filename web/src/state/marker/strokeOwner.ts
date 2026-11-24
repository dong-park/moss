/* ─────────────────────────────────────────────────────────────
 * wall-marker 리뷰 W9 — "이 획은 누구 것인가"의 단일 판정.
 *
 * 시작점이 주인이다(D4=A). 포스트잇 위에서 시작하면 그 포스트잇의 획, 그 밖(빈 벽·메모판·
 * 글상자·사진…)이면 벽 획(D12=A), 캔버스 UI(줌 막대·휴지통·검색…) 위면 아무도 아니다.
 * 벽 레이어·포스트잇 레이어·카드 껍데기·캔버스의 고르기 가드가 모두 이 판정만 쓴다 —
 * marker-meets-sticky D4가 규칙(메모판 위 획은 메모판 것)을 바꾸면 이 파일 하나만 고친다.
 * ───────────────────────────────────────────────────────────── */

import { useWorkspace, type Card } from "../workspace";

export type StrokeOwner =
  | { kind: "wall" }
  | { kind: "sticky"; cardId: string }
  | { kind: "none" };

/**
 * 이 카드 위에서 시작한 획의 주인. 포스트잇(text)만 자기 획을 갖고, 나머지 카드 위 획은 벽 것이다.
 * 카드 껍데기가 자기 레이어를 마운트할지 정할 때도 이걸 쓴다.
 */
export function strokeOwnerOfCard(card: Pick<Card, "id" | "kind">): StrokeOwner {
  return card.kind === "text" ? { kind: "sticky", cardId: card.id } : { kind: "wall" };
}

/**
 * 포인터가 닿은 요소의 획 주인.
 *
 * `host`는 캔버스 바탕(root) 요소다 — 바탕 자체에 닿았으면 벽이다. 월드(`[data-canvas-world]`)
 * 밖의 요소는 캔버스 UI라 아무도 아니다. 월드 안 카드 요소는 그 카드의 종류로 정하고, 스토어에
 * 이미 없는 카드(막 지워짐)는 벽으로 본다.
 */
export function strokeOwnerOf(target: EventTarget | null, host?: Element | null): StrokeOwner {
  if (!(target instanceof Element)) return { kind: "none" };
  if (host && target === host) return { kind: "wall" };
  if (!target.closest("[data-canvas-world]")) return { kind: "none" };
  const cardEl = target.closest<HTMLElement>("[data-card-id]");
  if (!cardEl) return { kind: "wall" };
  const card = useWorkspace.getState().cards.find((c) => c.id === cardEl.dataset.cardId);
  return card ? strokeOwnerOfCard(card) : { kind: "wall" };
}
