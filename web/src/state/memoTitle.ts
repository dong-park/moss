/**
 * FEAT-memo-title — 메모 제목 정규화 순수 함수.
 *
 * 제목은 평문 한 줄, 최대 80자. 줄바꿈·탭은 공백 한 칸으로 바꾼다(spec §4).
 *
 * FEAT-memo-title-front-edit AC-7 — 정규화를 두 단계로 나눈다. 칠 때는 줄바꿈
 * 치환과 80자 자르기만 하고, 앞뒤 공백 잘라내기는 편집을 끝낼 때만 한다. 그래야
 * "주간 " 다음 칸이 즉시 사라지지 않아 낱말 사이 공백을 칠 수 있다.
 */
export const MEMO_TITLE_MAX_LENGTH = 80;

/** 타이핑용 — 줄바꿈·탭 치환 + 80자 자르기. 앞뒤 공백은 살려 둔다(AC-7). */
export function normalizeTitleTyping(input: string): string {
  const oneLine = input.replace(/[\r\n\t]+/g, " ");
  return oneLine.slice(0, MEMO_TITLE_MAX_LENGTH);
}

/** 확정용 — 타이핑 정규화 후 앞뒤 공백을 잘라낸다. 자른 뒤 비면 빈 문자열. */
export function normalizeTitle(input: string): string {
  return normalizeTitleTyping(input).trim();
}
