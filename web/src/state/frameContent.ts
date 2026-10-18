/**
 * FEAT-sticky-redesign — 메모판(frame) Note.content 인코딩 단일 소스.
 *
 * 2단계 리뷰 P2: `JSON.stringify({name})`·기본값 "새 메모판"이 schema.ts(makeFrameNote)·
 * workspace.ts(renameFrame)·cards/frame/Content.tsx(parseFrameName) 세 곳에 흩어져
 * 있었다. 여기 하나로 모은다.
 *
 * 옛 세로 칸 판(FEAT-frame-skins)의 skin·columns는 읽지 않고, 다시 쓸 때 원본 그대로 보존한다.
 */

export const FRAME_DEFAULT_NAME = "새 메모판";
export const FRAME_NAME_MAX = 40;

export interface FrameContentJson {
  name?: string;
  /**
   * 옛 세로 칸 판의 데이터. 화면은 읽지 않지만(그룹 선 판) 다시 쓸 때 지우지 않는다 —
   * 나중에 되돌릴 길을 남긴다(D4).
   */
  skin?: unknown;
  columns?: unknown;
  /** FEAT-frame-image-template: 배경 이미지 원본 크기. 파일 참조는 판 행의 attachmentRef에 둔다. */
  bg?: FrameBackgroundSize;
}

/** 배경 이미지 원본 픽셀 크기. 비율 맞춤에 쓴다. */
export interface FrameBackgroundSize {
  w: number;
  h: number;
}

/** 정규화를 마친 판 설정 — 화면·스토어가 쓰는 모양. */
export interface FrameConfig {
  name: string;
  bg?: FrameBackgroundSize;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 이름 → trim 1~40자. 빈 이름은 기본 이름으로. */
function normalizeName(name: unknown): string {
  const trimmed = (typeof name === "string" ? name : "").trim().slice(0, FRAME_NAME_MAX);
  return trimmed === "" ? FRAME_DEFAULT_NAME : trimmed;
}

/** 배경 원본 크기 → 둘 다 양의 유한수일 때만 남긴다. 아니면 없음. */
export function normalizeFrameBg(raw: unknown): FrameBackgroundSize | undefined {
  if (!isRecord(raw)) return undefined;
  const { w, h } = raw as Record<string, unknown>;
  if (typeof w !== "number" || typeof h !== "number") return undefined;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  return { w, h };
}

/** 저장된 content를 파싱한다 — 실패·비객체는 빈 설정으로(오류로 멈추지 않는다). */
export function readFrameContent(content?: string): FrameContentJson {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? (parsed as FrameContentJson) : {};
  } catch {
    return {};
  }
}

/** content → 정규화된 설정. 옛 세로 칸 판도 칸 없이 이름·배경만 읽는다. */
export function decodeFrameConfig(content: string): FrameConfig {
  const raw = readFrameContent(content);
  const cfg: FrameConfig = { name: normalizeName(raw.name) };
  const bg = normalizeFrameBg(raw.bg);
  if (bg) cfg.bg = bg;
  return cfg;
}

/** content → 표시용 이름. 파싱 실패·빈 이름은 기본값으로 폴백. */
export function decodeFrameContent(content: string): string {
  return decodeFrameConfig(content).name;
}

/**
 * 설정 → frame Note.content. 이름은 trim 1~40자로 정규화한다.
 * 옛 세로 칸 판의 skin·columns는 있으면 손대지 않고 그대로 담는다.
 *
 * 문자열을 넘기면 이름만 있는 옛 호출(`encodeFrameContent("판")`)로 읽는다 —
 * 내보내기·마이그레이션의 기존 호출부를 그대로 둔다.
 */
export function encodeFrameContent(content: FrameContentJson | string = {}): string {
  const cfg: FrameContentJson = typeof content === "string" ? { name: content } : content;
  const out: FrameContentJson = { name: normalizeName(cfg.name) };
  if (cfg.skin !== undefined) out.skin = cfg.skin;
  if (cfg.columns !== undefined) out.columns = cfg.columns;
  const bg = normalizeFrameBg(cfg.bg);
  if (bg) out.bg = bg;
  return JSON.stringify(out);
}
