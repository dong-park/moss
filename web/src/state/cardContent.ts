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

export function parseHandwriting(content: string): HandwritingContent {
  if (!content) return { paths: [] };
  try {
    const v: unknown = JSON.parse(content);
    if (!v || typeof v !== "object") return { paths: [] };
    const raw = (v as { paths?: unknown }).paths;
    if (!Array.isArray(raw)) return { paths: [] };
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
    return { paths };
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

/* ─────────────────── 공통 ─────────────────── */

export function makeChecklistItemId(): string {
  return `i-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeMindmapNodeId(): string {
  return `n-${Math.random().toString(36).slice(2, 9)}`;
}
