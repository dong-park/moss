import { layout } from "@/design/tokens";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-variety — 메모마다 조금씩 다른 생김새.
 *
 * 각도와 색조를 메모 id 해시로 정한다. DB(`rotation`·`color` 칸)에는 아무것도
 * 쓰지 않는다 — 같은 id면 새로고침·다른 기기에서도 같은 값이 나온다.
 *
 * - 각도: ±tokens.card.rotation(1.5)도, 소수 둘째 자리까지.
 * - 색조: 노랑 계열 6단계 중 하나. 종이 위에 multiply로 얹는다(Content.tsx).
 * - 펜 모드에서는 각도를 0으로 세운다(펜 좌표 1:1, useDrawing.toLocal).
 * ───────────────────────────────────────────────────────────── */

/** 노랑 계열 6단계 — 레몬 → 꿀. 종이 결 위에 multiply로 얹힌다. */
export const MEMO_TINTS = [
  "#fff7bf",
  "#ffef9e",
  "#ffe27a",
  "#ffd98f",
  "#ffcf6e",
  "#ffe8b0",
] as const;

export const MEMO_TINT_COUNT = MEMO_TINTS.length;

/** 각도 상한(도) — tokens.card.rotation. 현재 1.5. */
export const MEMO_ROTATION_MAX_DEG = layout.card.rotation;

/** 집어 들 때 원래 각도에서 더 기우는 양(도). 모든 카드 공통, 각도 상한과는 별개 값이다. */
export const CARD_LIFT_DEG = 1.5;

/** FNV-1a 32비트 — 같은 id는 항상 같은 값을 낸다. */
export function hashMemoId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 소수 둘째 자리로 반올림하고 꼬리 0을 떼어 transform 문자열을 안정시킨다. */
export function formatDeg(deg: number): string {
  return Number(deg.toFixed(2)).toString();
}

/** 메모 고유 각도 — [-1.5, 1.5]도. */
export function memoRotationDeg(id: string): number {
  const unit = (hashMemoId(id) % 3001) / 3000; // [0, 1]
  return (unit * 2 - 1) * MEMO_ROTATION_MAX_DEG;
}

/** 색조 — 노랑 6단계 중 하나. */
export function memoTint(id: string): string {
  return MEMO_TINTS[hashMemoId(`${id}#tint`) % MEMO_TINT_COUNT];
}

function isText(kind: string): boolean {
  return kind === "text";
}

/** 각도 0으로 세워야 하는 상황(비메모 또는 펜 모드). */
function rotationOff(kind: string, penMode: boolean): boolean {
  return !isText(kind) || penMode;
}

/** 들지 않은 상태의 transform. 비메모는 지금처럼 undefined(무변화). */
export function memoBaseTransform(
  card: { id: string; kind: string },
  penMode: boolean,
): string | undefined {
  if (!isText(card.kind)) return undefined;
  const deg = penMode ? 0 : memoRotationDeg(card.id);
  return `rotate(${formatDeg(deg)}deg)`;
}

/**
 * 집어 든 상태의 transform — 원래 각도에서 -1.5도 더 기운다.
 * 비메모는 지금과 같은 `scale(1.03) rotate(-1.5deg)`.
 */
export function memoLiftedTransform(
  card: { id: string; kind: string },
  penMode: boolean,
): string {
  const deg = (rotationOff(card.kind, penMode) ? 0 : memoRotationDeg(card.id)) - CARD_LIFT_DEG;
  return `scale(1.03) rotate(${formatDeg(deg)}deg)`;
}
