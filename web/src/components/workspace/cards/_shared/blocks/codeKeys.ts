/* ─────────────────────────────────────────────────────────────
 * 코드 편집 키 정책 (순수 함수) — code 카드와 code 블록이 공유.
 * spec SIDEBAR-CARDS-UX §6 P1-C · FEAT-card-allinone §6.
 *   Tab        → caret 위치에 2 spaces (선택 영역 있으면 대체)
 *   Shift+Tab  → 현재 줄 leading 2 spaces 제거 (있을 때)
 *   Enter      → 줄바꿈 + 이전 줄 leading whitespace 복제 (auto-indent)
 * 들여쓰기 단위는 2 spaces (검색·diff 친화, tab 문자 미사용).
 * ───────────────────────────────────────────────────────────── */

export const INDENT = "  "; // 2 spaces

/** caret 위치를 포함하는 현재 줄의 [start, end] 범위. */
export function currentLineRange(value: string, caret: number): [number, number] {
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const nl = value.indexOf("\n", caret);
  const end = nl === -1 ? value.length : nl;
  return [start, end];
}

/** 주어진 줄의 leading whitespace(스페이스/탭). */
export function leadingWhitespace(line: string): string {
  const m = line.match(/^[ \t]*/);
  return m ? m[0] : "";
}

export interface CodeKeyResult {
  /** 갱신된 전체 코드 문자열. */
  code: string;
  /** 적용 후 caret 위치. */
  caret: number;
}

/**
 * Tab / Shift+Tab / Enter를 적용한 결과를 반환. 처리 대상이 아니면 null
 * (호출부가 textarea 기본 동작에 위임). Esc·기타 키는 여기서 다루지 않는다.
 */
export function applyCodeKey(
  value: string,
  selStart: number,
  selEnd: number,
  e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
): CodeKeyResult | null {
  // Shift+Tab → 현재 줄 leading 2 spaces 제거.
  if (e.key === "Tab" && e.shiftKey) {
    const [lineStart] = currentLineRange(value, selStart);
    if (value.slice(lineStart, lineStart + INDENT.length) === INDENT) {
      const code = value.slice(0, lineStart) + value.slice(lineStart + INDENT.length);
      const caret = Math.max(lineStart, selStart - INDENT.length);
      return { code, caret };
    }
    // 제거할 들여쓰기가 없으면 caret 유지 (기본 Tab 포커스 이동 방지는 호출부 preventDefault).
    return { code: value, caret: selStart };
  }

  // Tab → caret 위치에 2 spaces 삽입 (선택 영역 있으면 대체).
  if (e.key === "Tab") {
    const code = value.slice(0, selStart) + INDENT + value.slice(selEnd);
    return { code, caret: selStart + INDENT.length };
  }

  // Enter → 줄바꿈 + 이전 줄 leading whitespace 복제 (auto-indent).
  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    const [lineStart] = currentLineRange(value, selStart);
    const prefix = leadingWhitespace(value.slice(lineStart, selStart));
    const insertion = "\n" + prefix;
    const code = value.slice(0, selStart) + insertion + value.slice(selEnd);
    return { code, caret: selStart + insertion.length };
  }

  return null;
}
