/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-paste-sanitize (W6) — 붙여넣기 정제(HTML → 깔끔한 마크다운).
 *
 * 웹·문서에서 리치 HTML을 붙여넣으면 Milkdown이 span/style/class 같은 잡탕을
 * 흡수해 지저분한 마크다운이 된다. 이 핸들러가 paste 단계에서 먼저 가로채
 * **허용 태그(제목/목록/링크/코드/강조)만** 남긴 정제 트리로 바꾼다.
 *
 * 등록: extensions.ts `pasteHandlers[]`의 **첫 항목**(image보다 먼저).
 * 순서 계약([[_squad-memo-production]] §조율점): sanitize 먼저 → image(W2) 나중.
 *
 *  - AC-1 리치 텍스트 → 스팬/스타일 제거된 정제 마크다운.
 *  - AC-2 Cmd+Shift+V(=text/html 없음) → 서식 0 평문(기본 동작에 위임).
 *  - AC-3 코드블록 안 붙여넣기 → 원문 유지(정제 안 함, 기본 동작에 위임).
 *  - AC-4 image file 포함 클립보드 → 텍스트만 두고 false 통과 → W2가 이미지 처리.
 * ───────────────────────────────────────────────────────────── */

import { DOMParser as ProseDOMParser } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";

import type { PasteHandler } from "./extensions";

/* 정제 비용 폭주 방지(비기능 §8): 이 길이를 넘는 HTML은 평문만 추출한다. */
const MAX_HTML_LENGTH = 100_000;

/* 허용 태그 allowlist — 그 외 태그는 unwrap(태그 제거, 텍스트/자식만 보존). */
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const ALLOWED = new Set([
  ...HEADINGS,
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "strong",
  "b",
  "em",
  "i",
]);

/* b→strong, i→em 으로 정규화(마크다운 강조 한 종류로 모은다). */
function canonicalTag(tag: string): string {
  if (tag === "b") return "strong";
  if (tag === "i") return "em";
  return tag;
}

/* javascript:/data: 등 위험 스킴 차단 — http(s)/mailto/상대경로만 허용(XSS 표면 0). */
function safeHref(href: string | null): string | null {
  if (!href) return null;
  const v = href.trim();
  if (/^(https?:|mailto:)/i.test(v)) return v;
  if (/^[#/.]/.test(v) || /^[\w./-]+$/.test(v)) return v; // 상대경로/앵커
  return null;
}

/* 더러운 DOM → 허용 태그만 남긴 깨끗한 DOM 트리로 재구성.
 * disallowed 태그는 벗겨내되(unwrap) 자식 텍스트는 보존한다. */
function cleanInto(target: Node, source: Node, doc: Document): void {
  source.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      target.appendChild(doc.createTextNode(child.textContent ?? ""));
      return;
    }
    if (child.nodeType !== 1 /* ELEMENT_NODE */) return;

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED.has(tag)) {
      // 허용 안 된 래퍼(span/div/font/table…)는 벗기고 자식만 이어붙인다.
      cleanInto(target, el, doc);
      return;
    }

    const clean = doc.createElement(canonicalTag(tag));
    if (tag === "a") {
      const href = safeHref(el.getAttribute("href"));
      if (href) clean.setAttribute("href", href);
    }
    if (tag !== "br" && tag !== "pre") cleanInto(clean, el, doc);
    else if (tag === "pre") clean.textContent = el.textContent ?? "";
    target.appendChild(clean);
  });
}

function buildCleanRoot(html: string): HTMLElement {
  const dirty = new DOMParser().parseFromString(html, "text/html");
  const root = dirty.createElement("div");
  cleanInto(root, dirty.body, dirty);
  return root;
}

/* ── 정제 DOM → 마크다운 직렬화 ──────────────────────────────── */

function inlineWhitespace(text: string): string {
  return text.replace(/[\t\n\r ]+/g, " ");
}

function listToMarkdown(
  list: Element,
  ordered: boolean,
  depth: number,
): string {
  const indent = "  ".repeat(depth);
  const items: string[] = [];
  let idx = 1;
  list.childNodes.forEach((c) => {
    if (c.nodeType !== 1) return;
    const el = c as Element;
    if (el.tagName.toLowerCase() !== "li") return;

    const marker = ordered ? `${idx++}. ` : "- ";
    let head = "";
    const nested: string[] = [];
    el.childNodes.forEach((lc) => {
      if (lc.nodeType === 1) {
        const t = (lc as Element).tagName.toLowerCase();
        if (t === "ul") {
          nested.push(listToMarkdown(lc as Element, false, depth + 1));
          return;
        }
        if (t === "ol") {
          nested.push(listToMarkdown(lc as Element, true, depth + 1));
          return;
        }
      }
      head += nodeToMarkdown(lc);
    });
    const line = indent + marker + inlineWhitespace(head).trim();
    items.push(nested.length ? `${line}\n${nested.join("\n")}` : line);
  });
  return items.join("\n");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === 3) return inlineWhitespace(node.textContent ?? "");
  if (node.nodeType !== 1) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inner = () => {
    let s = "";
    el.childNodes.forEach((c) => (s += nodeToMarkdown(c)));
    return s;
  };

  if (HEADINGS.has(tag)) {
    const level = Number(tag[1]);
    const t = inlineWhitespace(inner()).trim();
    return t ? `\n\n${"#".repeat(level)} ${t}\n\n` : "";
  }

  switch (tag) {
    case "p": {
      const t = inner().trim();
      return t ? `\n\n${t}\n\n` : "";
    }
    case "br":
      return "\n";
    case "strong": {
      const t = inner().trim();
      return t ? `**${t}**` : "";
    }
    case "em": {
      const t = inner().trim();
      return t ? `*${t}*` : "";
    }
    case "code": {
      const t = el.textContent ?? "";
      return t ? `\`${t}\`` : "";
    }
    case "pre": {
      const t = (el.textContent ?? "").replace(/\n+$/, "");
      return t ? `\n\n\`\`\`\n${t}\n\`\`\`\n\n` : "";
    }
    case "a": {
      const t = inlineWhitespace(inner()).trim();
      if (!t) return "";
      const href = el.getAttribute("href");
      return href ? `[${t}](${href})` : t;
    }
    case "ul":
      return `\n\n${listToMarkdown(el, false, 0)}\n\n`;
    case "ol":
      return `\n\n${listToMarkdown(el, true, 0)}\n\n`;
    default:
      return inner();
  }
}

function normalize(md: string): string {
  return md
    .replace(/^[ \t]+$/gm, "") // 공백만 있는 줄 비우기
    .replace(/[ \t]+\n/g, "\n") // 줄 끝 공백 제거
    .replace(/\n{3,}/g, "\n\n") // 빈 줄 2개 초과 → 2개
    .trim();
}

/**
 * 더러운 HTML 클립보드 문자열 → 허용 태그(제목/목록/링크/코드/강조)만 남긴
 * 깔끔한 마크다운. span/style/class 등은 전부 제거된다(AC-1).
 * 거대 입력은 평문만 추출(§8 길이 캡).
 */
export function htmlToCleanMarkdown(html: string): string {
  if (!html) return "";
  if (html.length > MAX_HTML_LENGTH) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return inlineWhitespace(doc.body.textContent ?? "").trim();
  }
  const root = buildCleanRoot(html);
  return normalize(nodeToMarkdown(root));
}

/* ── 핸들러 ───────────────────────────────────────────────────── */

function getTransferData(
  event: ClipboardEvent | DragEvent,
): DataTransfer | null {
  if ("clipboardData" in event) return event.clipboardData;
  if ("dataTransfer" in event) return event.dataTransfer;
  return null;
}

/** 클립보드/드롭에 이미지 file이 들어있는지(AC-4: 있으면 통과시켜 W2가 처리). */
function hasImageFile(data: DataTransfer): boolean {
  const files = data.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i += 1) {
      if (files[i].type.startsWith("image/")) return true;
    }
  }
  const items = data.items;
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
        return true;
      }
    }
  }
  return false;
}

/** 현재 선택이 코드블록 내부인지(AC-3: 코드블록 안은 정제하지 않는다). */
function isInCodeBlock(view: EditorView): boolean {
  const { $from } = view.state.selection;
  for (let d = $from.depth; d >= 0; d -= 1) {
    if ($from.node(d).type.name === "code_block") return true;
  }
  return false;
}

export const sanitizePasteHandler: PasteHandler = (view, event) => {
  const data = getTransferData(event);
  if (!data) return false;

  // AC-4: 이미지 file 포함 → 통과(W2가 OPFS 저장 처리).
  if (hasImageFile(data)) return false;

  // AC-3: 코드블록 안 → 원문 유지(기본 붙여넣기에 위임).
  if (isInCodeBlock(view)) return false;

  // AC-2: text/html 없음(Cmd+Shift+V·평문 복사) → 평문 폴백(기본 동작에 위임).
  const html = data.getData("text/html");
  if (!html || !html.trim()) return false;

  const root = buildCleanRoot(html);
  if (!(root.textContent ?? "").trim()) return false;

  // 정제 트리를 에디터 스키마로 파싱 → 슬라이스로 삽입(마크다운 소스도 깨끗해진다).
  const slice = ProseDOMParser.fromSchema(view.state.schema).parseSlice(root);
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
};
