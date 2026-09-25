/**
 * FEAT-memo-fulltext-search (W4) — 메모 본문 전문 검색.
 *
 * 카드 본문(markdown 또는 레거시 블록 JSON)을 평문으로 환원한 뒤 검색어를 매칭한다.
 * 인덱스는 메모리 파생물 — persist 하지 않는다(spec §5). `plainText`는 카드 content가
 * 바뀌지 않으면 캐시를 재사용해 전체 재구축을 피한다(spec §8 증분 갱신).
 *
 * 순수 함수 모듈 — store/DOM 의존 없음. workspace.ts가 셀렉터/액션으로 감싸 노출한다.
 */
import { blocksToMarkdown } from "./cardContent";
import type { Card } from "./workspace";

/**
 * markdown(또는 블록 JSON) → 검색용 평문.
 *  - blocksToMarkdown으로 레거시 JSON 카드도 markdown으로 통일.
 *  - markdown 기호(제목·강조·코드펜스·링크·리스트 마커 등) 제거.
 *  - 공백 정규화 + 소문자화 → 대소문자·기호 무시 매칭(AC-1).
 */
export function plainText(markdown: string): string {
  const md = blocksToMarkdown(markdown ?? "");
  if (!md) return "";
  let s = md;
  // 펜스 코드블록 ```lang\n...\n``` → 내부 코드만 남김
  s = s.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code: string) => code ?? "");
  // 이미지 ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 링크 [text](url) → text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 위키링크 [[text]] → text
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // 인라인 코드 `code` → code
  s = s.replace(/`([^`]*)`/g, "$1");
  // 줄머리 제목(#)·인용(>)·리스트 마커(-/*/+, 1.) 제거
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");
  s = s.replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "");
  // 강조·취소선 마커 제거
  s = s.replace(/[*_~]/g, "");
  // 공백 정규화 + 소문자화
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * content 문자열 → 평문 캐시. content가 동일하면 재계산하지 않는다(증분 갱신).
 * 캐시 키는 content 자체라 카드 편집 시 자연히 무효화된다. 메모리 누수 방지를 위해
 * 상한을 두고 초과 시 가장 오래된 항목부터 비운다(LRU 근사).
 */
const CACHE_LIMIT = 2000;
const plainCache = new Map<string, string>();

function cachedPlainText(content: string): string {
  const hit = plainCache.get(content);
  if (hit !== undefined) {
    // 접근 순서 갱신 — 재삽입으로 가장 최근으로 민다.
    plainCache.delete(content);
    plainCache.set(content, hit);
    return hit;
  }
  const value = plainText(content);
  if (plainCache.size >= CACHE_LIMIT) {
    const oldest = plainCache.keys().next().value;
    if (oldest !== undefined) plainCache.delete(oldest);
  }
  plainCache.set(content, value);
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
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const results: { id: string; score: number }[] = [];
  for (const card of cards) {
    // 메모는 글(text) 카드 — 그 외(image/board/comment 등)는 본문 검색 대상 아님.
    // FEAT-text-tool: textbox도 평문이라 검색 대상에 포함한다.
    if (card.kind !== "text" && card.kind !== "textbox") continue;
    // FEAT-memo-title: 제목도 검색 대상. "제목 + 공백 + 본문 평문"에서 매칭한다(AC-8).
    // textbox는 마크다운이 아니라 원문 그대로 매칭한다(P2-3).
    const text =
      card.kind === "textbox"
        ? (card.content ?? "").toLowerCase()
        : cachedPlainText(card.content);
    const haystack =
      card.title && text ? `${card.title} ${text}` : (card.title ?? text);
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
  // score 내림차순, 동점이면 입력 순서 안정 유지.
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** 테스트·HMR용 — 평문 캐시 비우기. */
export function __clearPlainCache(): void {
  plainCache.clear();
}
