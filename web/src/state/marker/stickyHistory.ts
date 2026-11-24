/* ─────────────────────────────────────────────────────────────
 * wall-marker 리뷰 W6 — 포스트잇 획 되돌리기 기록.
 *
 * overlay는 문자열 하나이고 원격이 통째로 덮을 수 있다. 되돌리기는 "내가 더한 획 id"와
 * "내가 지운 획(원본)"만 알고, 되돌릴 때 지금 overlay에서 그 id만 빼거나 되살린다 — 그 사이
 * 남이 그은 획은 건드리지 않는다. 옛 획(id 없음)은 내용에서 만든 id로 구분한다.
 * ───────────────────────────────────────────────────────────── */

import {
  identifyStrokes,
  parseStrokes,
  serializeStrokes,
  type HandwritingStroke,
} from "../cardContent";
import type { MarkerHistoryEntry } from "./heldTool";

type StickyEntry = Extract<MarkerHistoryEntry, { kind: "sticky" }>;

/** 쓰기 전후 overlay의 획 구성 차이를 기록 항목으로. 구성이 안 바뀌면 null(기록하지 않는다). */
export function stickyEditEntry(
  noteId: string,
  prevOverlay: string,
  nextOverlay: string,
): StickyEntry | null {
  const prev = identifyStrokes(parseStrokes(prevOverlay));
  const next = identifyStrokes(parseStrokes(nextOverlay));
  const prevIds = new Set(prev.map((s) => s.id));
  const nextIds = new Set(next.map((s) => s.id));
  const added = next.filter((s) => !prevIds.has(s.id));
  const removed = prev
    .map((stroke, index) => ({ stroke, index }))
    .filter(({ stroke }) => !nextIds.has(stroke.id));
  if (added.length === 0 && removed.length === 0) return null;
  return { kind: "sticky", noteId, added, removed };
}

function write(strokes: readonly HandwritingStroke[]): string {
  // 획이 하나도 없으면 "그림 없음"(빈 문자열) — 처음 긋기 전과 같은 값이다.
  return strokes.length === 0 ? "" : serializeStrokes(strokes);
}

/** 이 동작을 뒤로 돌린 overlay: 더한 획을 빼고 지운 획을 원래 자리쯤에 되살린다. */
export function undoStickyEdit(currentOverlay: string, entry: StickyEntry): string {
  const current = identifyStrokes(parseStrokes(currentOverlay));
  const drop = new Set(entry.added.map((s) => s.id));
  const next: HandwritingStroke[] = current.filter((s) => !drop.has(s.id));
  const have = new Set(next.map((s) => s.id));
  for (const { stroke, index } of [...entry.removed].sort((a, b) => a.index - b.index)) {
    if (stroke.id && have.has(stroke.id)) continue;
    next.splice(Math.min(index, next.length), 0, stroke);
    if (stroke.id) have.add(stroke.id);
  }
  return write(next);
}

/** 이 동작을 다시 앞으로 돌린 overlay: 지운 획을 빼고 더한 획을 되살린다. */
export function redoStickyEdit(currentOverlay: string, entry: StickyEntry): string {
  const current = identifyStrokes(parseStrokes(currentOverlay));
  const drop = new Set(entry.removed.map(({ stroke }) => stroke.id));
  const next: HandwritingStroke[] = current.filter((s) => !drop.has(s.id));
  const have = new Set(next.map((s) => s.id));
  for (const stroke of entry.added) {
    if (stroke.id && have.has(stroke.id)) continue;
    next.push(stroke);
    if (stroke.id) have.add(stroke.id);
  }
  return write(next);
}
