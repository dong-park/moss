/**
 * FEAT-text-tool §7: textbox 비주얼 토큰.
 *
 * 배경·그림자·종이 없음 — 색 프리셋은 메모 노랑 틴트와 별개인 잉크 톤이다.
 * 크기 px는 store의 [[TEXT_SIZE_PX]]가 단일 소스.
 */

/** textbox 기본 색 — 잉크 톤. */
export const TEXT_DEFAULT_COLOR = "#334155";

export interface TextColorPreset {
  /** i18n 라벨 키 접미사 — workspace.textbox.color.<key>. */
  key: string;
  value: string;
}

/** 색 프리셋 8종. */
export const TEXT_COLOR_PRESETS: readonly TextColorPreset[] = [
  { key: "ink", value: "#334155" },
  { key: "slate", value: "#64748b" },
  { key: "blue", value: "#2563eb" },
  { key: "green", value: "#16a34a" },
  { key: "amber", value: "#d97706" },
  { key: "red", value: "#dc2626" },
  { key: "violet", value: "#7c3aed" },
  { key: "pink", value: "#db2777" },
] as const;
