/**
 * FEAT-sticky-redesign — 메모판(frame) Note.content 인코딩 단일 소스.
 *
 * 2단계 리뷰 P2: `JSON.stringify({name})`·기본값 "새 메모판"이 schema.ts(makeFrameNote)·
 * workspace.ts(renameFrame)·cards/frame/Content.tsx(parseFrameName) 세 곳에 흩어져
 * 있었다. 여기 하나로 모은다.
 *
 * FEAT-frame-skins: 이름만이 아니라 스킨·칸 목록까지 담는다. DB 스키마는 그대로 두고
 * content JSON만 넓힌다. 스킨이 free여도 columns는 지우지 않고 보관한다(AC-3).
 */

export const FRAME_DEFAULT_NAME = "새 메모판";
export const FRAME_NAME_MAX = 40;

/** 칸 이름 규약: trim, 최대 20자, "" 허용(AC-7). */
export const FRAME_COLUMN_NAME_MAX = 20;
/** 칸 수 하한·상한(§2 포함). 2 미만이면 기본 3칸으로 읽는다(AC-2). */
export const FRAME_COLUMN_COUNT_MIN = 2;
export const FRAME_COLUMN_COUNT_MAX = 8;
/** 칸 한 칸의 기준 폭. 세로 칸 판 최소 폭 = 칸 수 × 이 값(AC-4·AC-9). */
export const FRAME_COLUMN_WIDTH = 240;
/** 세로 칸 판 최대 폭(AC-10). */
export const FRAME_COLUMNS_MAX_WIDTH = 2400;

export type FrameSkinId = "free" | "columns";

export interface FrameColumn {
  id: string;
  name: string;
}

export interface FrameContentJson {
  name?: string;
  skin?: FrameSkinId;
  /** skin이 free여도 지우지 않고 보관한다. */
  columns?: FrameColumn[];
}

/** 정규화를 마친 판 설정 — 화면·스토어가 쓰는 모양. columns는 항상 2~8개. */
export interface FrameConfig {
  name: string;
  skin: FrameSkinId;
  columns: FrameColumn[];
}

/** 기본 칸 이름. AC-3의 "씨앗 / 자라는 중 / 묵힘". */
export const FRAME_DEFAULT_COLUMN_NAMES = ["씨앗", "자라는 중", "묵힘"] as const;

/** 칸 id는 화면 key 전용 — 새 칸마다 유일하면 된다. */
export function newFrameColumnId(): string {
  return `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 기본 3칸. id는 고정 — 디코딩할 때마다 새로 만들면 React key가 흔들린다. */
export function defaultFrameColumns(): FrameColumn[] {
  return FRAME_DEFAULT_COLUMN_NAMES.map((name, i) => ({
    id: `col-default-${i}`,
    name,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 이름 → trim 1~40자. 빈 이름은 기본 이름으로. */
function normalizeName(name: unknown): string {
  const trimmed = (typeof name === "string" ? name : "").trim().slice(0, FRAME_NAME_MAX);
  return trimmed === "" ? FRAME_DEFAULT_NAME : trimmed;
}

/** 칸 이름 → trim 최대 20자. "" 허용. */
function normalizeColumnName(name: unknown): string {
  return typeof name === "string" ? name.trim().slice(0, FRAME_COLUMN_NAME_MAX) : "";
}

/**
 * 모르는 모양의 칸 목록을 정규화한다(AC-2).
 * 배열이 아니거나, 항목이 객체가 아니거나, 2개 미만이면 기본 3칸. 최대 8개로 자른다.
 */
export function normalizeFrameColumns(raw: unknown): FrameColumn[] {
  if (!Array.isArray(raw)) return defaultFrameColumns();
  const columns: FrameColumn[] = [];
  for (const entry of raw.slice(0, FRAME_COLUMN_COUNT_MAX)) {
    if (!isRecord(entry)) return defaultFrameColumns();
    const id =
      typeof entry.id === "string" && entry.id !== "" ? entry.id : `col-fallback-${columns.length}`;
    columns.push({ id, name: normalizeColumnName(entry.name) });
  }
  if (columns.length < FRAME_COLUMN_COUNT_MIN) return defaultFrameColumns();
  return columns;
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

/** content → 정규화된 설정. 모르는 스킨은 free, 깨진 칸 목록은 기본 3칸(AC-2). */
export function decodeFrameConfig(content: string): FrameConfig {
  const raw = readFrameContent(content);
  return {
    name: normalizeName(raw.name),
    skin: raw.skin === "columns" ? "columns" : "free",
    columns: normalizeFrameColumns(raw.columns),
  };
}

/** content → 표시용 이름. 파싱 실패·빈 이름은 기본값으로 폴백. */
export function decodeFrameContent(content: string): string {
  return decodeFrameConfig(content).name;
}

/**
 * 설정 → frame Note.content. 이름은 trim 1~40자로 정규화하고,
 * 스킨은 알려진 값만, 칸 목록은 정규화해 담는다(있을 때만).
 *
 * 문자열을 넘기면 이름만 있는 옛 호출(`encodeFrameContent("판")`)로 읽는다 —
 * 내보내기·마이그레이션의 기존 호출부를 그대로 둔다.
 */
export function encodeFrameContent(content: FrameContentJson | string = {}): string {
  const cfg: FrameContentJson = typeof content === "string" ? { name: content } : content;
  const out: FrameContentJson = { name: normalizeName(cfg.name) };
  if (cfg.skin === "columns" || cfg.skin === "free") out.skin = cfg.skin;
  if (cfg.columns !== undefined) out.columns = normalizeFrameColumns(cfg.columns);
  return JSON.stringify(out);
}
