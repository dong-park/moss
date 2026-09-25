import type { Card } from "@/state/workspace";

/**
 * FEAT-home — 시스템 보드 큐레이팅 카드 데이터.
 * spec §5 SystemBoardCards 의 일부. MVP에서는 "now-staying" 한 종만 휴리스틱으로 산출한다.
 * 나머지(resurfacing/today-connection/flow-timeline)는 AI pipeline Slice 2 도착 후 추가.
 */
export interface NowStayingItem {
  kind: "now-staying";
  /** 그룹 라벨 — 카드 본문 첫 줄에서 추출. */
  theme: string;
  /** 같은 theme에 묶인 카드 id 목록. lastVisitedAt 내림차순. */
  noteIds: string[];
  /** noteIds.length — 사용자에게 노출되는 머무름 횟수. */
  visitCount: number;
}

export interface NowStayingOptions {
  /** 결과 최대 그룹 수. */
  maxThemes?: number;
  /** 그룹화 후보로 고려할 최근 카드 수. */
  topN?: number;
}

const DEFAULTS: Required<NowStayingOptions> = {
  maxThemes: 5,
  topN: 12,
};

/**
 * 카드 본문에서 그룹화 키를 추출한다.
 * - 첫 비공백 라인의 처음 한 토큰(공백/문장부호 분리)을 lowercase로.
 * - 의도된 단순함: 한국어 환경에서 첫 단어가 통상 키워드("첫구매", "마케팅" 등).
 *   너무 긴 키는 거의 묶이지 않아 휴리스틱 의미가 사라진다.
 * - 비어있거나 메타카드(comment 등)인 경우 빈 문자열.
 */
function themeKey(content: string): string {
  const firstLine = content.split(/\n/)[0]?.trim() ?? "";
  if (!firstLine) return "";
  const firstToken = firstLine.split(/[\s,.!?]+/).filter(Boolean)[0];
  return (firstToken ?? "").toLowerCase();
}

/**
 * 그룹의 표시용 라벨 — 첫 줄을 30자로 자른다.
 */
function themeLabel(content: string): string {
  const firstLine = content.split(/\n/)[0]?.trim() ?? "";
  if (firstLine.length <= 30) return firstLine;
  return `${firstLine.slice(0, 30)}…`;
}

/**
 * 휴리스틱 — lastVisitedAt 최근 카드들을 본문 첫 어절로 묶어 "지금 머무는 생각" 그룹을 산출.
 *
 * 의도된 단순함:
 * - AI 임베딩이 도착하기 전까지는 본문 첫 어절 일치만 사용한다 (오탐 적음).
 * - lastVisitedAt이 없거나 본문이 비어 있는 카드는 후보에서 제외.
 * - 그룹 내부 노트는 lastVisitedAt 내림차순.
 * - 그룹 간 정렬은 그룹 내 최신 노트의 lastVisitedAt 기준.
 */
export function computeNowStayingCards(
  cards: Card[],
  options: NowStayingOptions = {},
): NowStayingItem[] {
  const { maxThemes, topN } = { ...DEFAULTS, ...options };

  const candidates = cards
    // FEAT-text-tool: textbox는 주석/라벨이라 "머무는 생각" 큐레이팅에서 제외한다(가정).
    .filter((c) => c.kind !== "textbox")
    .filter((c) => (c.content?.trim().length ?? 0) > 0)
    .filter((c) => typeof c.lastVisitedAt === "number")
    .slice()
    .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
    .slice(0, topN);

  const groups = new Map<
    string,
    { theme: string; noteIds: string[]; lastVisitedAt: number }
  >();

  for (const card of candidates) {
    const key = themeKey(card.content);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.noteIds.push(card.id);
      // 후보가 내림차순이므로 첫 항목이 곧 최대 — 추가는 더 작은 값
    } else {
      groups.set(key, {
        theme: themeLabel(card.content),
        noteIds: [card.id],
        lastVisitedAt: card.lastVisitedAt ?? 0,
      });
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, maxThemes)
    .map((g) => ({
      kind: "now-staying" as const,
      theme: g.theme,
      noteIds: g.noteIds,
      visitCount: g.noteIds.length,
    }));
}
