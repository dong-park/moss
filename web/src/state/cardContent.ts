/**
 * Card.content 인코딩 헬퍼 — FEAT-capture §5 데이터 모델.
 *
 * 본문은 단일 string으로 저장된다 (DB schema 호환). type별 구조는 JSON으로 직렬화.
 * 모든 parse 함수는 빈 본문 또는 잘못된 JSON에 대해 graceful default를 반환한다 (AC-3).
 */

import {
  MAX_OVERLAY_CHARS,
  MAX_OVERLAY_STROKES,
  MAX_STROKE_POINTS,
  isBoardCoord,
  thinToMax,
} from "./marker/limits";
import {
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_WIDTH,
  resolveMarkerColor,
  resolveMarkerWidth,
  type MarkerColor,
  type MarkerWidth,
} from "./marker/tokens";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface HighlightContent {
  quote: string;
  source?: string;
}

export interface CodeContent {
  code: string;
  lang?: string;
}

export interface LinkContent {
  url: string;
  title?: string;
  summary?: string;
  thumbUrl?: string;
}

/* ─────────────────── Checklist ─────────────────── */

export function parseChecklist(content: string): ChecklistItem[] {
  if (!content) return [];
  try {
    const v: unknown = JSON.parse(content);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x): x is { id?: unknown; text?: unknown; done?: unknown } =>
          !!x && typeof x === "object",
      )
      .map((x, i) => ({
        id: typeof x.id === "string" ? x.id : `i-${i}`,
        text: typeof x.text === "string" ? x.text : "",
        done: x.done === true,
      }));
  } catch {
    return [];
  }
}

export function serializeChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
}

/* ─────────────────── Highlight ─────────────────── */

export function parseHighlight(content: string): HighlightContent {
  if (!content) return { quote: "" };
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") return { quote: "" };
    const o = v as { quote?: unknown; source?: unknown };
    return {
      quote: typeof o.quote === "string" ? o.quote : "",
      source: typeof o.source === "string" && o.source ? o.source : undefined,
    };
  } catch {
    return { quote: "" };
  }
}

export function serializeHighlight(data: HighlightContent): string {
  const out: HighlightContent = { quote: data.quote };
  if (data.source && data.source.trim()) out.source = data.source;
  return JSON.stringify(out);
}

/* ─────────────────── Code ─────────────────── */

export function parseCode(content: string): CodeContent {
  if (!content) return { code: "" };
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") return { code: "" };
    const o = v as { code?: unknown; lang?: unknown };
    return {
      code: typeof o.code === "string" ? o.code : "",
      lang: typeof o.lang === "string" && o.lang ? o.lang : undefined,
    };
  } catch {
    return { code: "" };
  }
}

export function serializeCode(data: CodeContent): string {
  const out: CodeContent = { code: data.code };
  if (data.lang && data.lang.trim()) out.lang = data.lang.trim();
  return JSON.stringify(out);
}

/* ─────────────────── Link ─────────────────── */

export function parseLink(content: string): LinkContent {
  if (!content) return { url: "" };
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") {
      // raw URL string saved as content (구버전 포맷 fallback)
      return { url: content };
    }
    const o = v as {
      url?: unknown;
      title?: unknown;
      summary?: unknown;
      thumbUrl?: unknown;
    };
    return {
      url: typeof o.url === "string" ? o.url : "",
      title: typeof o.title === "string" && o.title ? o.title : undefined,
      summary:
        typeof o.summary === "string" && o.summary ? o.summary : undefined,
      thumbUrl:
        typeof o.thumbUrl === "string" && o.thumbUrl ? o.thumbUrl : undefined,
    };
  } catch {
    return { url: content };
  }
}

export function serializeLink(data: LinkContent): string {
  const out: LinkContent = { url: data.url };
  if (data.title) out.title = data.title;
  if (data.summary) out.summary = data.summary;
  if (data.thumbUrl) out.thumbUrl = data.thumbUrl;
  return JSON.stringify(out);
}

/** 클립보드/입력값이 "URL만"인지 판별 — 앞뒤 공백 외 다른 텍스트가 없어야 한다. */
const URL_ONLY_PATTERN = /^https?:\/\/[^\s]+$/i;

export function isUrlOnly(text: string): boolean {
  return URL_ONLY_PATTERN.test(text.trim());
}

/**
 * /api/preview로 Open Graph 메타를 가져와 LinkContent로 반환.
 * 실패(네트워크·비-2xx·파싱)는 null — 호출부에서 url만으로 카드를 유지한다.
 * link 카드 편집부와 캔버스 붙여넣기 핸들러가 공유.
 */
export async function fetchLinkPreview(url: string): Promise<LinkContent | null> {
  try {
    const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    const meta = (await res.json()) as LinkContent;
    return { ...meta, url: meta.url || url };
  } catch {
    return null;
  }
}

/* ─────────────────── Handwriting ─────────────────── */

export interface HandwritingPoint {
  x: number;
  y: number;
}

export interface HandwritingContent {
  paths: HandwritingPoint[][];
}

/**
 * wall-marker n1 (D2=A): 색·굵기를 획마다 싣는 손글씨 획. 포스트잇 overlay가 쓴다.
 * 색·굵기는 이름이다(`state/marker/tokens`). 옛 획은 색·굵기가 없어 검정·가는 선으로 읽힌다.
 */
export interface HandwritingStroke {
  /**
   * 획 id(W6). 없으면 옛 획이다 — 읽는 쪽이 [[identifyStrokes]]로 내용에서 id를 만든다. 되돌리기가
   * "내가 더한 획·내가 지운 획"을 구분하는 기준이라 새 획은 항상 id를 싣고 쓴다.
   */
  id?: string;
  points: HandwritingPoint[];
  color: MarkerColor;
  width: MarkerWidth;
}

/** 내용에서 만든 id의 접두사. 쓰지 않는다(옛 획의 바이트를 바꾸지 않는다). */
const DERIVED_ID_PREFIX = "~";
const MAX_STROKE_ID_LENGTH = 80;

function coerceStrokeId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_STROKE_ID_LENGTH
    ? raw
    : undefined;
}

function coercePoints(raw: unknown): HandwritingPoint[] {
  if (!Array.isArray(raw)) return [];
  const pts: HandwritingPoint[] = [];
  for (const pt of raw) {
    if (pts.length >= MAX_STROKE_POINTS) break; // 점 수 상한(W2)
    // 유한하지 않거나 보드 한계 밖인 좌표는 버린다 — 원격 피어가 JSON `1e999`(Infinity)나 ±1e300을
    // 넣어도 지우개·렌더가 멎지 않게 받는 자리에서 거른다.
    if (
      pt &&
      typeof pt === "object" &&
      isBoardCoord((pt as { x?: unknown }).x) &&
      isBoardCoord((pt as { y?: unknown }).y)
    ) {
      pts.push({ x: (pt as HandwritingPoint).x, y: (pt as HandwritingPoint).y });
    }
  }
  return pts;
}

/**
 * unknown → 획 배열로 정제. 잘못된 점·빈 획은 제거한다.
 * 한 획은 옛 형식(점 배열)이거나 새 형식(`{points, color?, width?}`)이다 — 둘 다 읽는다.
 * 색·굵기가 없거나 모르는 이름이면 검정·가는 선이다.
 */
export function coerceStrokes(raw: unknown): HandwritingStroke[] {
  if (!Array.isArray(raw)) return [];
  const strokes: HandwritingStroke[] = [];
  for (const entry of raw) {
    if (strokes.length >= MAX_OVERLAY_STROKES) break; // 획 수 상한(W2)
    if (Array.isArray(entry)) {
      const points = coercePoints(entry);
      if (points.length > 0) {
        strokes.push({ points, color: DEFAULT_MARKER_COLOR, width: DEFAULT_MARKER_WIDTH });
      }
    } else if (entry && typeof entry === "object") {
      const rec = entry as { id?: unknown; points?: unknown; color?: unknown; width?: unknown };
      const points = coercePoints(rec.points);
      if (points.length > 0) {
        const id = coerceStrokeId(rec.id);
        strokes.push({
          ...(id ? { id } : {}),
          points,
          color: resolveMarkerColor(rec.color),
          width: resolveMarkerWidth(rec.width),
        });
      }
    }
  }
  return strokes;
}

/** unknown → 손글씨 path 배열로 정제(점만). 새 형식 획도 점만 꺼낸다. parseHandwriting·블록 환원이 공유. */
export function coercePaths(raw: unknown): HandwritingPoint[][] {
  return coerceStrokes(raw).map((s) => s.points);
}

export function parseHandwriting(content: string): HandwritingContent {
  if (!content) return { paths: [] };
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") return { paths: [] };
    return { paths: coercePaths((v as { paths?: unknown }).paths) };
  } catch {
    return { paths: [] };
  }
}

/**
 * 점만 직렬화한다 — 색·굵기를 싣지 않는다. 옛 호출부(블록·레거시 카드)용이다.
 * 색·굵기가 있는 overlay는 [[serializeStrokes]]를 쓴다.
 */
export function serializeHandwriting(data: HandwritingContent): string {
  return JSON.stringify({ paths: data.paths });
}

/** overlay JSON → 획 배열(색·굵기 포함). 비었거나 깨졌으면 빈 배열. */
export function parseStrokes(content: string): HandwritingStroke[] {
  if (!content || content.length > MAX_OVERLAY_CHARS) return [];
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") return [];
    return coerceStrokes((v as { paths?: unknown }).paths);
  } catch {
    return [];
  }
}

/**
 * 획 배열 → overlay JSON. 검정·가는 선인 획은 옛 형식(점 배열) 그대로 써서, 옛 데이터를
 * 읽고 다시 써도 바이트가 달라지지 않는다. 그 밖의 획만 `{points, color, width}`로 쓴다.
 */
export function serializeStrokes(strokes: readonly HandwritingStroke[]): string {
  // 읽는 쪽과 같은 상한을 쓰는 쪽에서도 지킨다 — 점은 솎고, 획이 너무 많으면 오래된 획부터 뺀다.
  const bounded =
    strokes.length > MAX_OVERLAY_STROKES ? strokes.slice(-MAX_OVERLAY_STROKES) : strokes;
  const paths = bounded.map((s) => {
    const points = thinToMax(s.points) as HandwritingPoint[];
    // 내용에서 만든 id는 쓰지 않는다 — 옛 획은 읽고 다시 써도 바이트가 달라지지 않는다.
    const id = s.id && !s.id.startsWith(DERIVED_ID_PREFIX) ? s.id : undefined;
    return !id && s.color === DEFAULT_MARKER_COLOR && s.width === DEFAULT_MARKER_WIDTH
      ? points
      : { ...(id ? { id } : {}), points, color: s.color, width: s.width };
  });
  return JSON.stringify({ paths });
}

/** 내용(점·색·굵기)에서 32비트 FNV-1a 해시를 만든다. */
function strokeContentHash(s: HandwritingStroke): string {
  let h = 0x811c9dc5;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  feed(`${s.color}|${s.width}|`);
  for (const p of s.points) feed(`${p.x},${p.y};`);
  return (h >>> 0).toString(36);
}

/**
 * id 없는 옛 획에 내용에서 만든 id(`~해시-n`)를 붙인다 — 같은 내용은 어느 기기에서나 같은 id다.
 * 쓰지 않고 읽을 때만 붙이므로 overlay의 바이트는 그대로다. 같은 내용이 여럿이면 나온 순서로 n을 센다.
 */
export function identifyStrokes(
  strokes: readonly HandwritingStroke[],
): Array<HandwritingStroke & { id: string }> {
  const seen = new Map<string, number>();
  return strokes.map((s) => {
    if (s.id) return s as HandwritingStroke & { id: string };
    const h = strokeContentHash(s);
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return { ...s, id: `${DERIVED_ID_PREFIX}${h}-${n}` };
  });
}

/* ─────────────────── Mindmap ─────────────────── */

export interface MindmapNode {
  id: string;
  text: string;
  children: MindmapNode[];
}

export interface MindmapContent {
  root: MindmapNode;
}

function defaultMindmapNode(): MindmapNode {
  return { id: "root", text: "", children: [] };
}

function coerceNode(v: unknown, fallbackId: string): MindmapNode | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { id?: unknown; text?: unknown; children?: unknown };
  const node: MindmapNode = {
    id: typeof o.id === "string" ? o.id : fallbackId,
    text: typeof o.text === "string" ? o.text : "",
    children: [],
  };
  if (Array.isArray(o.children)) {
    for (let i = 0; i < o.children.length; i++) {
      const child = coerceNode(o.children[i], `${node.id}-${i}`);
      if (child) node.children.push(child);
    }
  }
  return node;
}

export function parseMindmap(content: string): MindmapContent {
  if (!content) return { root: defaultMindmapNode() };
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") return { root: defaultMindmapNode() };
    const root = coerceNode((v as { root?: unknown }).root, "root");
    return { root: root ?? defaultMindmapNode() };
  } catch {
    return { root: defaultMindmapNode() };
  }
}

export function serializeMindmap(data: MindmapContent): string {
  return JSON.stringify({ root: data.root });
}

/* ─────────────────── 올인원 블록 (FEAT-card-allinone) ─────────────────── */

/**
 * 글(text) 카드 한 장에 쌓이는 블록. content는 CardBlock[]를 JSON 배열로 직렬화한다.
 * 배열은 "["로 시작하므로 comment 마커("{"로 시작) 검사와 충돌하지 않는다.
 */
export type CardBlock =
  | { type: "text"; text: string }
  | { type: "code"; code: string; lang?: string }
  | { type: "handwriting"; paths: HandwritingPoint[][] };

export function serializeBlocks(blocks: CardBlock[]): string {
  // 빈 카드 / 단일 text 블록은 plain string으로 저장 → 레거시 글 카드와 동일 형태 유지.
  // 임베딩·키워드·제목 등 content를 평문으로 읽는 소비자의 회귀를 막는다
  // (블록 JSON은 멀티 블록 또는 code/handwriting 포함 시에만 발생).
  if (blocks.length === 0) return "";
  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }
  return JSON.stringify(blocks);
}

/**
 * CardBlock[] JSON → markdown 문자열 (Dexie v3 upgrade·런타임 어댑터 공용).
 *
 * 카드와 모달이 같은 Milkdown 렌더러를 쓰기 위한 통일 포맷.
 *  - text 블록 → 본문 그대로
 *  - code 블록 → fenced code block ```lang\\ncode\\n```
 *  - handwriting 블록 → 폐기(펜 overlay로 대체)
 * 블록은 사이에 빈 줄을 넣어 markdown 단락 경계를 만든다.
 * content가 JSON 배열이 아니거나 빈 값이면 원문 그대로 반환 — 이미 markdown.
 */
export function blocksToMarkdown(content: string): string {
  if (!content) return "";
  let v: unknown;
  try {
    v = JSON.parse(content);
  } catch {
    return content;
  }
  if (!Array.isArray(v)) return content;
  const parts: string[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const type = (raw as { type?: unknown }).type;
    if (type === "text") {
      const text = (raw as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    } else if (type === "code") {
      const o = raw as { code?: unknown; lang?: unknown };
      const code = typeof o.code === "string" ? o.code : "";
      const lang = typeof o.lang === "string" ? o.lang.trim() : "";
      parts.push("```" + lang + "\n" + code + "\n```");
    }
    // handwriting: drop. 카드 overlay에 별도 그리기 레이어가 있으므로 손실 의도.
  }
  // 정제 결과가 비어있고 원본이 JSON 배열이지만 인식 불가 → 원문 보존(손실 방지).
  if (parts.length === 0 && v.length > 0) return content;
  return parts.join("\n\n");
}

/* ─────────────────── 공통 ─────────────────── */

export function makeChecklistItemId(): string {
  return `i-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeMindmapNodeId(): string {
  return `n-${Math.random().toString(36).slice(2, 9)}`;
}
