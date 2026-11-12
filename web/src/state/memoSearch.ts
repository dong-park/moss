/**
 * FEAT-memo-fulltext-search (W4) — 메모 본문 전문 검색.
 *
 * 카드 본문(markdown 또는 레거시 블록 JSON)을 평문으로 환원한 뒤 검색어를 매칭한다.
 * 인덱스는 메모리 파생물 — persist 하지 않는다(spec §5). `plainText`는 카드 content가
 * 바뀌지 않으면 캐시를 재사용해 전체 재구축을 피한다(spec §8 증분 갱신).
 *
 * 순수 함수 모듈 — store/DOM 의존 없음. workspace.ts가 셀렉터/액션으로 감싸 노출한다.
 */
import { plainTextRaw, presentMemo } from "./memoPresentation";
import type { Card } from "./workspace";

export { plainText, plainTextRaw } from "./memoPresentation";

/**
 * content 문자열 → 평문 캐시. content가 동일하면 재계산하지 않는다(증분 갱신).
 * 캐시 키는 content 자체라 카드 편집 시 자연히 무효화된다. 메모리 누수 방지를 위해
 * 상한을 두고 초과 시 가장 오래된 항목부터 비운다(LRU 근사).
 */
const CACHE_LIMIT = 2000;
const searchCache = new Map<string, string>();

function cachedSearchText(card: Card): string {
  // Include every input to the read-only view model. A title or ink edit must invalidate
  // the empty-state label even when the body stays unchanged.
  const key = JSON.stringify([card.kind, card.content, card.title, card.overlay, card.attachmentRef]);
  const hit = searchCache.get(key);
  if (hit !== undefined) {
    searchCache.delete(key);
    searchCache.set(key, hit);
    return hit;
  }
  const raw = card.kind === "text" ? plainTextRaw(card.content) : (card.content ?? "");
  const value = presentMemo(card, raw).searchText;
  if (searchCache.size >= CACHE_LIMIT) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, value);
  return value;
}

/** 텍스트에서 토큰의 비중첩 등장 횟수. */
function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count += 1;
    from = idx + needle.length;
  }
  return count;
}

/**
 * 메모(text 카드) 본문에서 query 매칭. 모든 토큰을 포함하는 카드만 결과에 넣고,
 * 토큰 총 등장 횟수를 score로 삼아 내림차순 정렬한다(AC-1, 랭킹).
 * query가 비면 빈 배열(검색 비활성).
 */
export function searchMemos(
  cards: Card[],
  query: string,
): { id: string; score: number }[] {
  if (!query.trim()) return [];
  const entries = cards
    .filter(card => card.kind === "text" || card.kind === "textbox" || (card.kind === "photo" && !!card.content.trim()))
    .map(card => ({ id: card.id, searchText: cachedSearchText(card) }));
  return searchMemoEntries(entries, query);
}

/** Match pre-derived visible text, shared by table and canvas. */
export function searchMemoEntries(entries: { id: string; searchText: string }[], query: string): { id: string; score: number }[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const results: { id: string; score: number }[] = [];
  for (const card of entries) {
    const haystack = card.searchText.toLowerCase();
    if (!haystack) continue;
    let total = 0;
    let allPresent = true;
    for (const tok of tokens) {
      const c = occurrences(haystack, tok);
      if (c === 0) {
        allPresent = false;
        break;
      }
      total += c;
    }
    if (allPresent) results.push({ id: card.id, score: total });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** 테스트·HMR용 — 평문 캐시 비우기. */
export function __clearPlainCache(): void {
  searchCache.clear();
}
