import type { Note } from "@/state/db/schema";
import { isStopWord } from "./stopwords";
import type { KeywordItem } from "./types";

const TOP_N = 8;
const KO_RE = /[가-힣]{2,}/g;
const EN_RE = /[a-zA-Z]{3,}/g;

function tokenize(content: string): string[] {
  const tokens: string[] = [];
  const koMatches = content.match(KO_RE);
  if (koMatches) tokens.push(...koMatches);
  const enMatches = content.match(EN_RE);
  if (enMatches) tokens.push(...enMatches.map((t) => t.toLowerCase()));
  return tokens;
}

export function extractKeywords(notes: Note[]): KeywordItem[] {
  const counts = new Map<string, number>();

  for (const note of notes) {
    if (!note.content) continue;
    const seen = new Set<string>();
    for (const token of tokenize(note.content)) {
      if (isStopWord(token)) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => (b.count - a.count) || a.token.localeCompare(b.token))
    .slice(0, TOP_N);
}
