/**
 * moss 디자인 토큰
 *
 * 원천: PRD §8 (비주얼 디자인 방향) + §10 (레이아웃 토큰).
 * CSS variable과 1:1 매핑 (globals.css에서 같은 키로 노출).
 *
 * 토큰 추가/수정 시:
 * 1. 이 파일에서 추가
 * 2. globals.css에 같은 이름의 CSS variable 정의
 * 3. tailwind의 @theme inline 블록에 노출 (Tailwind 유틸리티에서 사용)
 */

export const color = {
  bg: "var(--color-bg)",
  panel: "var(--color-panel)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  textSoft: "var(--color-text-soft)",
  accent: {
    lime: "var(--color-accent-lime)",
    blue: "var(--color-accent-blue)",
    purple: "var(--color-accent-purple)",
    yellow: "var(--color-accent-yellow)",
  },
  card: {
    base: "var(--color-card-base)",
    yellow: "var(--color-card-yellow)",
    blue: "var(--color-card-blue)",
    lime: "var(--color-card-lime)",
    purple: "var(--color-card-purple)",
  },
  hover: "var(--color-hover)",
  active: {
    bg: "var(--color-active-bg)",
    fg: "var(--color-active-fg)",
  },
  dot: "var(--color-dot)",
} as const;

export const font = {
  family: {
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
    hand: "var(--font-hand)",
  },
  size: {
    xs: "0.75rem",   // 12
    sm: "0.875rem",  // 14
    base: "0.9375rem", // 15  (한글 가독성 최소)
    md: "1rem",      // 16
    lg: "1.125rem",  // 18
    xl: "1.375rem",  // 22
    display: "2rem", // 32
  },
  leading: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.7",
    breath: "1.85", // 카피·에디토리얼 톤
  },
  tracking: {
    tight: "-0.01em",
    normal: "0",
    wide: "0.04em",
    widest: "0.12em", // 사이드바 'TOOLS' 같은 라벨
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
  },
} as const;

export const space = {
  px: "1px",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
} as const;

export const radius = {
  xs: "0.25rem",
  sm: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
  full: "9999px",
} as const;

/**
 * PRD §10 레이아웃 토큰. moss 전반에 걸친 고정 치수.
 */
export const layout = {
  // FEAT-sticky-redesign n8: 사이드바를 걷고 화면 아래 가운데 독으로 교체.
  dock: {
    width: 269,
    height: 56,
    bottomMargin: 20, // 화면 하단에서 독 상자까지
    iconBase: 40,
    iconHover: 72,
  },
  header: 0,
  toolbar: 0,
  card: {
    width: {
      min: 220,
      max: 280,
    },
    rotation: 1.5, // ±도. 종이 질감
  },
  // 데스크톱 기준 너비 (1280 ~ 1920 반응형)
  breakpoint: {
    mobile: 430,
    tablet: 768,
    desktop: 1024,
    wide: 1440,
  },
} as const;

/**
 * z-index 순서 (PRD §10).
 */
export const z = {
  canvas: 0,
  card: 10,
  connection: 20,
  selection: 30,
  panel: 40,
  // n10 브라우저 결함5: 모달 오버레이 — panel(독)보다 위, 모달 본문보다는 아래.
  overlay: 45,
  modal: 50,
  toast: 60,
} as const;

/**
 * PRD §8-4 모션. 빠른 마이크로 인터랙션보다 부드러운 등장·잔향.
 */
export const motion = {
  duration: {
    instant: "80ms",
    fast: "120ms",  // 카드 등장
    base: "180ms",  // 사이드바 토글
    slow: "200ms",  // 모달 등장 / 잔향 페이드
    drawIn: "400ms", // 연결선 그려지는 애니메이션
  },
  easing: {
    out: "cubic-bezier(0.16, 1, 0.3, 1)",     // 등장
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",  // 양방향
    paper: "cubic-bezier(0.25, 0.46, 0.45, 0.94)", // 종이 떨어지는 느낌
  },
} as const;

/**
 * 그림자 — 종이/카드/모달 단계.
 * PRD §8-5 텍스처: 종이 질감, 핀, 모서리 접힘.
 */
export const shadow = {
  none: "none",
  card: "0 1px 2px rgba(42, 39, 34, 0.04), 0 2px 6px rgba(42, 39, 34, 0.06)",
  cardLift: "0 4px 12px rgba(42, 39, 34, 0.08), 0 8px 24px rgba(42, 39, 34, 0.06)",
  // FEAT-frame-feel D5: 메모판 전용 — 기존 들기보다 깊은 무게.
  frameLift: "0 6px 14px rgba(42, 39, 34, 0.14), 0 20px 52px rgba(42, 39, 34, 0.18)",
  modal: "0 12px 40px rgba(42, 39, 34, 0.16)",
} as const;

export const tokens = {
  color,
  font,
  space,
  radius,
  layout,
  z,
  motion,
  shadow,
} as const;

export type Tokens = typeof tokens;
