import type { Note } from "@/state/db/schema";

/**
 * 24-시간 히스토그램. `result[h]` = createdAt이 로컬 시간 h시인 메모 수.
 * 본문이 빈 메모(image-only 등)는 "사고를 남긴 시점"이 아니므로 제외.
 */
export function buildRhythm(notes: Note[]): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const note of notes) {
    if (!note.content.trim()) continue;
    const hour = new Date(note.createdAt).getHours();
    buckets[hour] += 1;
  }
  return buckets;
}
