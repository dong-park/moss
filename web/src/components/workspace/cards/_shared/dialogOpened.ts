/**
 * 카드 ID별 dialog auto-open 1회만 실행하도록 추적.
 * useEffect의 strict-mode 이중 호출도 흡수.
 * image/file 카드가 공유한다.
 */
export const dialogOpenedFor = new Set<string>();
