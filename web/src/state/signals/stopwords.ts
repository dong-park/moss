/**
 * 한/영 stop-words. Signals Slice 1 — 단순 토큰 빈도 노이즈 제거용.
 * 형태소 분석 도입은 후속 슬라이스.
 */

const KO_STOPWORDS = [
  // 조사 (어절 단위에서 분리 안 되지만, 단독 출현 시 제거)
  "그리고", "그러나", "그래서", "하지만", "또는", "그냥", "정말", "진짜",
  "이런", "저런", "그런", "이렇게", "저렇게", "그렇게", "여기", "저기", "거기",
  "지금", "오늘", "내일", "어제", "다시", "다음", "이전", "이번", "저번",
  "많이", "조금", "약간", "매우", "너무", "아주", "그저", "단지", "오직",
  "하나", "둘", "셋", "넷", "다섯",
  "내가", "네가", "우리", "당신", "자기",
  "있다", "없다", "이다", "아니다", "같다", "다르다",
  "한다", "된다", "한", "된", "할", "될", "함", "됨",
  "있는", "없는", "있을", "없을", "있어", "없어",
  "것이", "것을", "것은", "것도",
  "수가", "수를", "수는", "수도",
  "때문", "위해", "통해", "대해",
];

const EN_STOPWORDS = [
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her",
  "was", "one", "our", "out", "day", "get", "has", "him", "his", "how",
  "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did",
  "its", "let", "put", "say", "she", "too", "use", "with", "this", "that",
  "have", "from", "they", "know", "want", "been", "good", "much", "some",
  "time", "very", "when", "come", "here", "just", "like", "long", "make",
  "many", "over", "such", "take", "than", "them", "well", "were", "what",
  "your", "about", "after", "again", "could", "every", "first", "found",
  "great", "made", "most", "only", "other", "right", "their", "there",
  "these", "thing", "think", "those", "three", "where", "which", "while",
  "would", "should", "because", "before", "between", "through",
];

const STOPWORD_SET = new Set<string>([...KO_STOPWORDS, ...EN_STOPWORDS]);

export function isStopWord(token: string): boolean {
  return STOPWORD_SET.has(token);
}
