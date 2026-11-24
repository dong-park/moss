/* ─────────────────────────────────────────────────────────────
 * wall-marker n1 — 마카 색·굵기 토큰.
 *
 * 색과 굵기는 **이름**으로 저장한다(D3). 재질이 바뀌어도 같은 이름을 재질에 맞는 값으로
 * 다시 그릴 수 있다. 화면 값(색 hex·굵기 수치)은 이 파일 한 곳에만 둔다 — 트레이·그리기
 * 엔진·렌더가 모두 여기를 읽는다.
 *
 * 굵기 수치는 보드 단위다(D14) — 줌과 함께 커진다. 실제 수치는 marker-feel이 조율한다;
 * 여기 값은 임시값이고, 바꿀 때는 이 표만 고친다.
 * ───────────────────────────────────────────────────────────── */

export const MARKER_COLORS = ["black", "blue", "red", "green"] as const;
export type MarkerColor = (typeof MARKER_COLORS)[number];

export const MARKER_WIDTHS = ["thin", "mid", "thick"] as const;
export type MarkerWidth = (typeof MARKER_WIDTHS)[number];

/** 색·굵기 정보가 없는 옛 획이 읽히는 값. */
export const DEFAULT_MARKER_COLOR: MarkerColor = "black";
export const DEFAULT_MARKER_WIDTH: MarkerWidth = "thin";

/** 색 이름 → 화면 값. mockups/gen.py의 ink·blue·red·green. */
export const MARKER_COLOR_VALUE: Readonly<Record<MarkerColor, string>> = {
  black: "#1f2430",
  blue: "#2457b8",
  red: "#d0453c",
  green: "#2f8a57",
};

/** 굵기 이름 → 보드 단위 수치. 임시값(marker-feel이 조율). */
export const MARKER_WIDTH_UNITS: Readonly<Record<MarkerWidth, number>> = {
  thin: 2,
  mid: 4,
  thick: 8,
};

export function isMarkerColor(value: unknown): value is MarkerColor {
  return typeof value === "string" && (MARKER_COLORS as readonly string[]).includes(value);
}

export function isMarkerWidth(value: unknown): value is MarkerWidth {
  return typeof value === "string" && (MARKER_WIDTHS as readonly string[]).includes(value);
}

/** 모르는 값(옛 획·원격 peer의 낯선 이름)은 기본 색으로 읽는다. */
export function resolveMarkerColor(value: unknown): MarkerColor {
  return isMarkerColor(value) ? value : DEFAULT_MARKER_COLOR;
}

export function resolveMarkerWidth(value: unknown): MarkerWidth {
  return isMarkerWidth(value) ? value : DEFAULT_MARKER_WIDTH;
}

/** 이름 → CSS 색. 모르는 이름은 기본 색. */
export function markerColorValue(color: unknown): string {
  return MARKER_COLOR_VALUE[resolveMarkerColor(color)];
}

/** 이름 → 보드 단위 굵기. 모르는 이름은 기본 굵기. */
export function markerWidthUnits(width: unknown): number {
  return MARKER_WIDTH_UNITS[resolveMarkerWidth(width)];
}
