/* ─────────────────────────────────────────────────────────────
 * 줌 역보정(zoom compensation) + 메모 LOD 공통 유틸.
 *
 * 캔버스 world 레이어가 CSS 변수 --zoom(= viewport.scale)을 내려준다. 라벨은
 *   font-size: max(<기본>, calc(<최소화면>px / var(--zoom, 1)))
 * 식으로 줌아웃해도 화면상 최소 크기를 지킨다. 값은 CSS 문자열일 뿐이라
 * 줌 프레임마다 라벨이 React 리렌더되지 않는다.
 *
 * 메모(text) 카드는 scale < MEMO_LOD_SCALE이면 본문 대신 제목(없으면 본문 첫 줄)만
 * 크게·클램프해 보여주는 LOD 표시로 전환한다(boolean 셀렉터라 임계 통과 때만 리렌더).
 * ───────────────────────────────────────────────────────────── */
import { plainTextRaw } from "@/state/memoSearch";

/** 짧은 라벨(파일함 이름·개수, 메모판 이름)이 화면에서 보장받는 최소 크기(px). */
export const ZOOM_MIN_SCREEN_PX = 11;

/** 메모 LOD로 전환되는 줌 임계. 이 값 미만이면 메모 앞면은 제목만 크게 보여준다. */
export const MEMO_LOD_SCALE = 0.6;

/** LOD 라벨이 화면에서 보장받는 최소 크기(px) — 일반 라벨보다 읽기 쉽게. */
export const MEMO_LOD_MIN_SCREEN_PX = 13;

/** LOD 라벨의 기본(월드) 크기(px) — 앞면 제목과 동일. */
export const MEMO_LOD_BASE_PX = 15;

/** LOD 라벨이 보여주는 최대 줄 수. */
export const MEMO_LOD_MAX_LINES = 3;

/**
 * 기본 CSS 크기 식(base)에 줌 역보정 하한을 씌운다.
 *   max(<base>, calc(<minScreenPx>px / var(--zoom, 1)))
 * --zoom은 world 레이어에서 상속된다(단위 없는 수).
 */
export function zoomCompensatedSize(
  base: string,
  minScreenPx: number = ZOOM_MIN_SCREEN_PX,
): string {
  return `max(${base}, calc(${minScreenPx}px / var(--zoom, 1)))`;
}

/** px 숫자 기본값 버전. */
export function zoomCompensatedPx(
  basePx: number,
  minScreenPx: number = ZOOM_MIN_SCREEN_PX,
): string {
  return zoomCompensatedSize(`${basePx}px`, minScreenPx);
}

/**
 * markdown(또는 블록 JSON)에서 첫 비어있지 않은 줄을 평문으로 뽑는다.
 * 제목이 없을 때 LOD 라벨로 쓸 본문 첫 줄 — 마커(#, -, ** 등)는 [[plainTextRaw]]가 벗긴다.
 */
export function firstLine(markdown: string): string {
  for (const raw of (markdown ?? "").split(/\r?\n/)) {
    const line = plainTextRaw(raw);
    if (line) return line;
  }
  return "";
}
