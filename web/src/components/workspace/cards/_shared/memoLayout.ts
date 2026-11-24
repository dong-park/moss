/* ─────────────────────────────────────────────────────────────
 * 메모(text) 카드 본문의 고정 레이아웃 폭.
 *
 * 카드와 펼침 모달이 모두 이 폭으로 텍스트를 1:1 배치한다 → 줄바꿈(reflow)이
 * 카드 크기와 무관하게 항상 동일하다. 펜 overlay는 같은 컬럼 안 1:1 좌표라
 * 줄바꿈이 불변인 한 항상 같은 글자 위에 정렬된다(스케일/viewBox 환산 불필요).
 *
 * 카드는 card.width × card.height 박스로 이 컬럼을 크롭(overflow hidden)하고,
 * 모달은 전체를 다 보여준다("펼치면 항상 최대"). 화면 크기에 의존하면 줄바꿈이
 * 달라져 펜이 어긋나므로 반드시 상수여야 한다(펼친 창 스크롤 영역 744px = 컬럼 720px + 스크롤바 여유 24px 기준).
 * ───────────────────────────────────────────────────────────── */
// Mobile dialog policy: ink-free notes may reflow; ink-bearing notes and active
// drawing retain this exact logical width and scale text + SVG together to fit.
// A reversible 100% view permits intentional horizontal scrolling for editing.
// Never persist the visual scale or migrate existing points when resizing.
export const MEMO_CONTENT_WIDTH = 720;

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-title — 제목 줄 높이.
 *
 * 앞면과 창이 같은 MemoTitleRow를 쓰며 이 상수로 높이를 고정한다. 제목은
 * 한 줄(white-space:nowrap + ellipsis)이라 길이와 무관하게 항상 이 높이다.
 * 펜 overlay 기준 박스는 본문 컬럼이므로 이 줄은 컬럼 바깥 위에 둔다.
 * ───────────────────────────────────────────────────────────── */
export const MEMO_TITLE_ROW_HEIGHT = 30;
