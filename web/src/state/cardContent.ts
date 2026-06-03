/**
 * Card.content 인코딩 헬퍼 — FEAT-capture §5 데이터 모델.
 *
 * 본문은 단일 string으로 저장된다 (DB schema 호환). type별 구조는 JSON으로 직렬화.
 * 모든 parse 함수는 빈 본문 또는 잘못된 JSON에 대해 graceful default를 반환한다 (AC-3).
 */

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
      // raw URL string saved as content (legacy fallback)
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

/* ─────────────────── Handwriting ─────────────────── */

export interface HandwritingPoint {
  x: number;
  y: number;
}

export interface HandwritingContent {
  paths: HandwritingPoint[][];
}

/** unknown → 손글씨 path 배열로 정제. 잘못된 점·빈 path는 제거. parseHandwriting·블록 환원이 공유. */
export function coercePaths(raw: unknown): HandwritingPoint[][] {
  if (!Array.isArray(raw)) return [];
  const paths: HandwritingPoint[][] = [];
  for (const p of raw) {
    if (!Array.isArray(p)) continue;
    const pts: HandwritingPoint[] = [];
    for (const pt of p) {
      if (
        pt &&
        typeof pt === "object" &&
        typeof (pt as { x?: unknown }).x === "number" &&
        typeof (pt as { y?: unknown }).y === "number"
      ) {
        pts.push({ x: (pt as HandwritingPoint).x, y: (pt as HandwritingPoint).y });
      }
    }
    if (pts.length > 0) paths.push(pts);
  }
  return paths;
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

export function serializeHandwriting(data: HandwritingContent): string {
  return JSON.stringify({ paths: data.paths });
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
