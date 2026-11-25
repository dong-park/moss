/**
 * FEAT-memo-fulltext-search (W4) — 메모 본문 전문 검색.
 *
 * 카드 본문(markdown 또는 레거시 블록 JSON)을 평문으로 환원한 뒤 검색어를 매칭한다.
 * 인덱스는 메모리 파생물 — persist 하지 않는다(spec §5). `plainText`는 카드 content가
 * 바뀌지 않으면 캐시를 재사용해 전체 재구축을 피한다(spec §8 증분 갱신).
 *
 * 한글 검색(KS-1): 검색어의 글자마다 초성·완성 글자·글자 일부를 맞춘다. 초성 분해는
 * 한글 음절 코드 범위(0xAC00~0xD7A3)로 직접 계산한다 — 외부 라이브러리 없음.
 *
 * 순수 함수 모듈 — store/DOM 의존 없음. workspace.ts가 셀렉터/액션으로 감싸 노출한다.
 */
import { blocksToMarkdown } from "./cardContent";
import { EMPTY_LINK_CONTENT } from "./linkContent";
import { presentMemo } from "./memoPresentation";
import type { Card } from "./workspace";

/**
 * markdown(또는 블록 JSON) → 검색용 평문.
 *  - blocksToMarkdown으로 레거시 JSON 카드도 markdown으로 통일.
 *  - markdown 기호(제목·강조·코드펜스·링크·리스트 마커 등) 제거.
 *  - 공백 정규화 + 소문자화 → 대소문자·기호 무시 매칭(AC-1).
 */
export function plainText(markdown: string): string {
  return plainTextRaw(markdown).toLowerCase();
}

/**
 * markdown(또는 블록 JSON) → 검색·미리보기용 평문. 대소문자는 보존한다
 * ([[plainText]]는 검색용으로 소문자화한 결과를 돌려준다).
 */
export function plainTextRaw(markdown: string): string {
  if (markdown === EMPTY_LINK_CONTENT) return "";
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
  // 공백 정규화(대소문자 보존)
  return s.replace(/\s+/g, " ").trim();
}

// ─── 한글 초성 ───────────────────────────────────────────────────────────────

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 음절 하나에 받침 28칸(없음 포함) — 초성이 같은 음절끼리의 묶음 크기는 21×28. */
const JONGSEONG_SPAN = 28;
const CHOSEONG_SPAN = 21 * JONGSEONG_SPAN;
/** 초성 19개(호환 자모) — ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ. */
const CHOSEONG: readonly string[] = [
  0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145,
  0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e,
].map((c) => String.fromCharCode(c));

function isSyllable(code: number): boolean {
  return code >= HANGUL_FIRST && code <= HANGUL_LAST;
}

/**
 * 한글 음절을 초성으로 바꾼다. 음절이 아닌 글자(영문·숫자·기호·이미 자모인 글자)는 그대로 둔다.
 * 글자 수가 보존된다(UTF-16 단위 1:1) — 칠할 구간 계산이 이 성질에 기댄다.
 */
export function chosungOf(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out += isSyllable(code)
      ? CHOSEONG[Math.floor((code - HANGUL_FIRST) / CHOSEONG_SPAN)]
      : text[i];
  }
  return out;
}

/** 한 글자 소문자화. 길이가 변하는 글자(İ 등)는 구간이 어긋나지 않게 그대로 둔다. */
function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  return lower.length === 1 ? lower : ch;
}

/** 글 하나의 검색용 파생물. raw·fold·cho는 모두 같은 길이라 위치가 1:1로 대응한다. */
interface TextIndex {
  /** 칠할 구간이 놓이는 원문(대소문자 보존). */
  raw: string;
  /** 글자별 소문자화. */
  fold: string;
  /** 글자별 초성 — 음절이면 초성 자모, 아니면 fold와 같다. */
  cho: string;
}

function buildIndex(raw: string): TextIndex {
  let fold = "";
  let cho = "";
  for (let i = 0; i < raw.length; i++) {
    const f = foldChar(raw[i]);
    fold += f;
    const code = f.charCodeAt(0);
    cho += isSyllable(code)
      ? CHOSEONG[Math.floor((code - HANGUL_FIRST) / CHOSEONG_SPAN)]
      : f;
  }
  return { raw, fold, cho };
}

/**
 * 글 내용 → 검색용 파생물 캐시. 키가 글 내용 자체라 카드 편집 시 자연히 무효화된다
 * (spec §8 증분 갱신). 메모리 누수 방지를 위해 상한을 두고 초과 시 가장 오래된 항목부터
 * 비운다(LRU 근사). 상한은 모든 벽 검색(KS-3)의 2,000장보다 넉넉히 둔다 — 처음부터 끝까지
 * 훑는 검색은 상한을 한 장만 넘어도 LRU가 매번 전부 비워 키 입력마다 다시 만든다. 본문(평문화 거침)과 원문 그대로 매칭하는 글(제목·textbox·사진 캡션)은
 * 같은 내용이어도 다른 파생물이라 캐시를 따로 둔다.
 */
const CACHE_LIMIT = 5000;
const plainCache = new Map<string, TextIndex>();
const rawCache = new Map<string, TextIndex>();

function cached(
  cache: Map<string, TextIndex>,
  key: string,
  make: (key: string) => TextIndex,
): TextIndex {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // 접근 순서 갱신 — 재삽입으로 가장 최근으로 민다.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = make(key);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/** 마크다운 본문 → 파생물. raw는 [[plainTextRaw]] 결과라 미리보기와 같은 문자열 위에 구간이 놓인다. */
function indexOfMarkdown(content: string): TextIndex {
  return cached(plainCache, content, (c) => buildIndex(plainTextRaw(c)));
}

/** 원문 그대로 매칭하는 글(제목·textbox·사진 캡션) → 파생물. */
function indexOfRaw(text: string): TextIndex {
  return cached(rawCache, text, buildIndex);
}

/**
 * 본문을 마크다운이 아니라 원문 그대로 매칭하는 종류(P2-3). 검색 파생물과 결과 줄에 보일 글이
 * 모두 이 규칙을 따라야 칠할 구간이 같은 문자열 위에 놓인다 — 규칙은 여기 한 곳에만 둔다.
 */
function isRawBody(kind: string): boolean {
  return kind === "textbox" || kind === "photo";
}

/** 카드 본문 → 파생물. textbox·photo는 마크다운이 아니라 원문 그대로 매칭한다(P2-3). */
function bodyIndexOf(card: Card): TextIndex {
  return isRawBody(card.kind) ? indexOfRaw(card.content ?? "") : indexOfMarkdown(card.content);
}

/**
 * 결과 줄·미리보기에 보일 본문 원문. 검색 파생물([[bodyIndexOf]])과 같은 문자열이다 —
 * text 는 평문화한 것, textbox·photo 는 원문 그대로.
 */
export function bodyTextOf(card: Pick<Card, "kind" | "content">): string {
  return isRawBody(card.kind) ? (card.content ?? "") : plainTextRaw(card.content);
}

/**
 * 본문 검색 대상 종류 — 글(text)·텍스트 상자·사진(캡션). 그 외(image/board/comment 등)는
 * 본문 검색 대상이 아니다. 저장된 노트의 kind 도 이 규칙으로 가른다.
 */
export function isSearchableKind(kind: string): boolean {
  return kind === "text" || kind === "textbox" || kind === "photo";
}

function isSearchable(card: Card): boolean {
  return isSearchableKind(card.kind);
}

/**
 * 검색 파생물을 미리 만들어 캐시에 둔다. 모든 벽 검색 창이 열릴 때 한 번 부르면 첫 글자
 * 입력이 평문화 비용을 치르지 않는다(T13). 검색 결과는 바뀌지 않는다.
 */
export function warmMemoIndex(cards: Card[]): void {
  for (const card of cards) {
    if (!isSearchable(card)) continue;
    if (card.content) bodyIndexOf(card);
    if (card.title) indexOfRaw(card.title);
  }
}

// ─── 매칭 ────────────────────────────────────────────────────────────────────

/** 원문 기준 [start, end) 구간. */
export type MatchRange = readonly [start: number, end: number];

/** 글 하나에 대한 매칭 결과. */
export interface TextMatch {
  /** 모든 낱말의 비중첩 등장 횟수 합. */
  count: number;
  /** 칠할 구간 — 시작 순 정렬, 겹치거나 맞닿은 구간은 합쳤다. */
  ranges: MatchRange[];
}

interface QueryToken {
  /** 글자별 소문자화한 검색어 낱말. */
  chars: string;
  /**
   * 마지막 글자가 받침 없는 음절이면 받침만 있는 음절과도 맞춘다(D3 = A) — 조합 중인
   * 마지막 글자 '이지'가 '이직'을 찾게 한다. 검색어 전체의 마지막 글자에만 켠다.
   */
  relaxLast: boolean;
}

/** 검색어 → 낱말 목록. 공백으로 나누며 낱말이 없으면 null. */
function compileQuery(query: string): QueryToken[] | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word, i) => {
    let chars = "";
    for (let k = 0; k < word.length; k++) chars += foldChar(word[k]);
    const lastCode = chars.charCodeAt(chars.length - 1);
    return {
      chars,
      relaxLast:
        i === words.length - 1 &&
        isSyllable(lastCode) &&
        (lastCode - HANGUL_FIRST) % JONGSEONG_SPAN === 0,
    };
  });
}

/** 글의 pos 에서 낱말이 시작해 맞는가. */
function matchesAt(index: TextIndex, tok: QueryToken, pos: number): boolean {
  const { fold, cho } = index;
  const last = tok.chars.length - 1;
  for (let k = 0; k <= last; k++) {
    const q = tok.chars[k];
    const p = pos + k;
    // 초성 자모(ㅇ)는 cho 와, 그 밖의 글자는 fold 와 같으면 맞다. 음절이 아닌 글에서는
    // cho === fold 라 자모·영문·숫자도 글자 그대로 맞는다.
    if (cho[p] === q || fold[p] === q) continue;
    if (k === last && tok.relaxLast) {
      const t = fold.charCodeAt(p);
      // 초성·중성이 같으면(받침 칸을 뺀 몫이 같으면) 받침이 달라도 맞다.
      if (
        isSyllable(t) &&
        Math.floor((t - HANGUL_FIRST) / JONGSEONG_SPAN) ===
          Math.floor((q.charCodeAt(0) - HANGUL_FIRST) / JONGSEONG_SPAN)
      ) {
        continue;
      }
    }
    return false;
  }
  return true;
}

/** 낱말 하나의 비중첩 등장 구간. */
function scanToken(index: TextIndex, tok: QueryToken): MatchRange[] {
  const out: MatchRange[] = [];
  const m = tok.chars.length;
  const limit = index.fold.length - m;
  for (let i = 0; i <= limit; ) {
    if (matchesAt(index, tok, i)) {
      out.push([i, i + m]);
      i += m;
    } else {
      i += 1;
    }
  }
  return out;
}

/** 시작 순 정렬 + 겹치거나 맞닿은 구간 합치기. 입력은 바꾸지 않는다. */
function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length < 2) return ranges.slice();
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = out[out.length - 1];
    if (sorted[i][0] <= cur[1]) cur[1] = Math.max(cur[1], sorted[i][1]);
    else out.push([sorted[i][0], sorted[i][1]]);
  }
  return out;
}

/**
 * 검색어와 글 하나 → 맞았는지, 몇 번, 어디를 칠할지. 순수 함수(T14).
 *  - 검색어는 공백으로 낱말을 나누며 모든 낱말이 맞아야 한다. 아니면 null.
 *  - 자음 하나(ㄱ~ㅎ, ㄲ·ㄸ·ㅃ·ㅆ·ㅉ 포함)는 음절의 초성과 맞는다. `ㄲ`은 `ㄱ`과 다르다.
 *  - 완성 음절은 같은 음절과 맞고, 검색어 마지막 글자가 받침 없는 음절이면 받침만 있는
 *    음절과도 맞는다(D3).
 *  - 영문은 대소문자를 가리지 않고, 숫자·기호는 글자 그대로 맞춘다.
 *  - `ranges`는 넘겨받은 `text` 그대로의 위치다(대소문자 보존).
 * 빈 검색어는 null.
 */
export function matchText(query: string, text: string): TextMatch | null {
  const tokens = compileQuery(query);
  if (!tokens) return null;
  return matchIndex(tokens, indexOfRaw(text));
}

function matchIndex(tokens: QueryToken[], index: TextIndex): TextMatch | null {
  if (!index.raw) return null;
  let count = 0;
  const all: MatchRange[] = [];
  for (const tok of tokens) {
    const found = scanToken(index, tok);
    if (found.length === 0) return null;
    count += found.length;
    all.push(...found);
  }
  return { count, ranges: mergeRanges(all) };
}

/** 표와 같은 보이는 문구. 제목·본문에 없는 빈 메모 이름도 여기서 맞춘다. */
function semanticIndex(card: Card): TextIndex {
  const raw = card.kind === "photo" ? (card.content ?? "") : plainTextRaw(card.content ?? "");
  return indexOfRaw(presentMemo(card, raw).searchText);
}

/** [[searchMemos]] 결과 한 건. */
export interface MemoSearchHit {
  id: string;
  /** 낱말 등장 횟수 합(제목 + 본문). 랭킹에 쓴다. */
  score: number;
  /** 제목에서 칠할 구간 — 제목 원문 `card.title` 기준. */
  titleRanges: MatchRange[];
  /**
   * 본문에서 칠할 구간. `text` 카드는 [[plainTextRaw]]`(card.content)`, `textbox`·`photo`는
   * `card.content` 원문 위의 위치다.
   */
  bodyRanges: MatchRange[];
}

/**
 * 메모(text 카드) 본문에서 query 매칭. 모든 낱말이 제목이나 본문 어딘가에 맞는 카드만
 * 결과에 넣고, 낱말 총 등장 횟수를 score로 삼아 내림차순 정렬한다(AC-1, 랭킹).
 * query가 비면 빈 배열(검색 비활성).
 */
export function searchMemos(cards: Card[], query: string): MemoSearchHit[] {
  const tokens = compileQuery(query);
  if (!tokens) return [];
  // 초성만인 검색은 본문 인덱스만 본다. 빈 메모 이름 같은 보이는 문구는 완성 글자가 있을 때만.
  const wantSemantic = /[^\s\u3131-\u314e]/.test(query);

  const results: MemoSearchHit[] = [];
  for (const card of cards) {
    // FEAT-text-tool: textbox도 평문이라 검색 대상에 포함한다.
    // FEAT-photo-card: 사진은 캡션(content)을 검색 대상으로 포함한다. 캡션이 비면
    // 글이 비어 아래에서 자연히 제외된다(성공 기준 11).
    if (!isSearchable(card)) continue;
    // FEAT-memo-title: 제목도 검색 대상(AC-8). 제목과 본문을 따로 훑되, 낱말이 어느 쪽에
    // 있든 모든 낱말이 맞아야 카드가 든다.
    const body = bodyIndexOf(card);
    const title = card.title ? indexOfRaw(card.title) : null;
    let score = 0;
    const titleRanges: MatchRange[] = [];
    const bodyRanges: MatchRange[] = [];
    let allPresent = true;
    for (const tok of tokens) {
      const inTitle = title ? scanToken(title, tok) : [];
      const inBody = body.raw ? scanToken(body, tok) : [];
      const inSemantic =
        wantSemantic && inTitle.length + inBody.length === 0 ? scanToken(semanticIndex(card), tok) : [];
      if (inTitle.length + inBody.length + inSemantic.length === 0) {
        allPresent = false;
        break;
      }
      score += inTitle.length + inBody.length + inSemantic.length;
      titleRanges.push(...inTitle);
      bodyRanges.push(...inBody);
    }
    if (allPresent) {
      results.push({
        id: card.id,
        score,
        titleRanges: mergeRanges(titleRanges),
        bodyRanges: mergeRanges(bodyRanges),
      });
    }
  }
  // score 내림차순, 동점이면 입력 순서 안정 유지.
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** 테스트·HMR용 — 평문 캐시 비우기. */
export function __clearPlainCache(): void {
  plainCache.clear();
  rawCache.clear();
}

export function searchMemoEntries(
  entries: { id: string; searchText: string }[],
  query: string,
): { id: string; score: number }[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const results: { id: string; score: number }[] = [];
  for (const card of entries) {
    const haystack = card.searchText.toLowerCase();
    if (!haystack) continue;
    let total = 0;
    let allPresent = true;
    for (const tok of tokens) {
      let count = 0;
      let from = 0;
      while (from <= haystack.length) {
        const at = haystack.indexOf(tok, from);
        if (at < 0) break;
        count += 1;
        from = at + tok.length;
      }
      if (count === 0) {
        allPresent = false;
        break;
      }
      total += count;
    }
    if (allPresent) results.push({ id: card.id, score: total });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
