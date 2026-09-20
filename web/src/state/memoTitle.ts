/**
 * FEAT-memo-title — 메모 제목 정규화 순수 함수.
 *
 * 제목은 평문 한 줄, 최대 80자. 앞뒤 공백은 잘라내고 줄바꿈·탭은 공백 한 칸으로
 * 바꾼다(spec §4). 자른 뒤 비면 빈 문자열(= 제목 없음)이다.
 */
export const MEMO_TITLE_MAX_LENGTH = 80;

export function normalizeTitle(input: string): string {
  const oneLine = input.replace(/[\r\n\t]+/g, " ").trim();
  return oneLine.slice(0, MEMO_TITLE_MAX_LENGTH);
}
