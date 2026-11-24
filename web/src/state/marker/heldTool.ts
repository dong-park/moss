/* ─────────────────────────────────────────────────────────────
 * wall-marker n2 — 손에 든 도구와 마카 되돌리기 기록의 형식.
 *
 * 손에 든 도구는 하나뿐이다: 내려놓음(null) · 마카 들림(색 하나) · 천 들림.
 * 마카와 천을 동시에 들 수 없는 것은 타입이 막는다(합집합이라 둘이 한 값에 못 든다).
 * 상태 전이와 "글 편집 중엔 들 수 없다" 같은 상호배타는 스토어 액션이 지킨다.
 * ───────────────────────────────────────────────────────────── */

import type { HandwritingStroke } from "../cardContent";
import type { WallStroke } from "../db/schema";
import type { MarkerColor } from "./tokens";

export type HeldTool =
  | null
  | { kind: "marker"; color: MarkerColor }
  | { kind: "cloth" };

export type HeldMarker = { kind: "marker"; color: MarkerColor };

export function isMarkerHeld(tool: HeldTool): tool is HeldMarker {
  return tool !== null && tool.kind === "marker";
}

export function isClothHeld(tool: HeldTool): boolean {
  return tool !== null && tool.kind === "cloth";
}

/** 마카든 천이든 무언가 들고 있다. 포스트잇 끌기·편집을 막는 기준. */
export function isToolHeld(tool: HeldTool): boolean {
  return tool !== null;
}

/**
 * 이 입력이 그릴 도구 — D5=A.
 *
 * 들고 있는 것이 있으면 그것이 그린다(마우스·손가락·펜 가리지 않는다).
 * 아무것도 안 들었어도 태블릿 펜(`pointerType === "pen"`)이 닿으면 마지막에 쓴 마카로 그린다.
 * 안 들었을 때 손가락·마우스는 null — 포스트잇 이동·화면 이동·고르기 상자로 간다.
 */
export function drawingToolFor(
  heldTool: HeldTool,
  pointerType: string,
  lastMarkerColor: MarkerColor,
): HeldMarker | { kind: "cloth" } | null {
  if (heldTool) return heldTool;
  if (pointerType === "pen") return { kind: "marker", color: lastMarkerColor };
  return null;
}

/** D10=A: 화면 짧은 변이 이 값 미만이면 휴대폰. iPad mini 세로(744)는 태블릿으로 남는다. */
export const PHONE_SHORT_SIDE_PX = 600;

export function isPhoneSize(width: number, height: number): boolean {
  return Math.min(width, height) < PHONE_SHORT_SIDE_PX;
}

/** 지금 창이 휴대폰 크기인가. window가 없으면(SSR) 아니다. */
export function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  return isPhoneSize(window.innerWidth, window.innerHeight);
}

/**
 * 마카 되돌리기 기록 한 항목 — 벽 획과 포스트잇 획을 한 줄로 관리한다(D9=A).
 *
 * - wall: `before`는 이 동작이 지운 획, `after`는 이 동작이 더한 획.
 *   (새 획 = before [] / after [획], 지우개 = before [지운 획] / after [남은 조각])
 * - sticky: 포스트잇 한 장의 overlay에서 "더한 획"과 "지운 획(원본·자리)". overlay는 문자열
 *   하나라 전후 문자열 전체를 기록하면 되돌릴 때 남이 그은 획까지 같이 돌아간다(리뷰 W6).
 *   되돌릴 때는 지금 overlay에서 그 id만 빼거나 되살린다.
 *
 * 공유 보드에서 남의 획은 기록에 들어오지 않는다 — 기록은 내가 한 동작만 쌓는다.
 */
export type MarkerHistoryEntry =
  | { kind: "wall"; before: WallStroke[]; after: WallStroke[] }
  | {
      kind: "sticky";
      noteId: string;
      /** 이 동작이 더한 획(id 포함). */
      added: HandwritingStroke[];
      /** 이 동작이 지운 획(원본)과 지우기 전 자리(획 배열 인덱스). */
      removed: Array<{ stroke: HandwritingStroke; index: number }>;
    };

/** 기록 한도 — 한 보드를 오래 써도 메모리가 무한히 늘지 않게 한다. */
export const MARKER_HISTORY_LIMIT = 200;
