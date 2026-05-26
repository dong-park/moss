/**
 * FEAT-markdown-memo-pen — 레거시 카드(code/checklist/highlight)의 본문을
 * 마크다운 텍스트로 변환하는 순수 함수 모음.
 *
 * - Dexie version(2).upgrade()에서 기존 행을 일괄 재작성하는 데 사용한다.
 * - workspace.decodeNoteToCard()에서 업그레이드 누락분을 방어적으로 환원하는 데도 쓴다.
 * - 입력 content는 각 kind의 serialize 포맷(JSON 문자열). parse 헬퍼로 graceful default.
 *
 * comment 카드는 NoteKind="text"로 저장되므로 여기 변환 대상이 아니다 (호출측에서 제외).
 */

import { parseChecklist, parseCode, parseHighlight } from "./cardContent";

/** 본문에 등장하는 백틱 런보다 1개 긴 코드펜스를 만들어 ``` 충돌을 피한다. */
function fenceFor(code: string): string {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) {
    if (run.length > longest) longest = run.length;
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/** code `{code,lang}` → 펜스 코드블록. */
export function codeToMarkdown(content: string): string {
  const { code, lang } = parseCode(content);
  const fence = fenceFor(code);
  return `${fence}${lang ?? ""}\n${code}\n${fence}`;
}

/** checklist `[{text,done}]` → GFM 작업목록. 빈 목록은 빈 문자열. */
export function checklistToMarkdown(content: string): string {
  const items = parseChecklist(content);
  return items
    .map((i) => `- [${i.done ? "x" : " "}] ${i.text}`)
    .join("\n");
}

/** highlight `{quote,source?}` → 인용 블록 (source는 별도 인용 라인). */
export function highlightToMarkdown(content: string): string {
  const { quote, source } = parseHighlight(content);
  const quoted = quote
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return source ? `${quoted}\n>\n> — ${source}` : quoted;
}

/** 마이그레이션 대상 kind 집합. */
export const MIGRATED_KINDS = ["code", "checklist", "highlight"] as const;
export type MigratedKind = (typeof MIGRATED_KINDS)[number];

export function isMigratedKind(kind: string): kind is MigratedKind {
  return (MIGRATED_KINDS as readonly string[]).includes(kind);
}

/**
 * 레거시 kind의 본문을 마크다운으로 변환한다. 대상 kind가 아니면 null.
 * 반환값을 받은 호출측이 kind="text"로 교체하고 content를 갈아끼운다.
 */
export function migratedContent(kind: string, content: string): string | null {
  switch (kind) {
    case "code":
      return codeToMarkdown(content);
    case "checklist":
      return checklistToMarkdown(content);
    case "highlight":
      return highlightToMarkdown(content);
    default:
      return null;
  }
}
