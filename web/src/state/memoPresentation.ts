import { blocksToMarkdown } from "./cardContent";
import { countBlocks } from "./blocks";
import { EMPTY_LINK_CONTENT } from "./linkContent";
import { memoFace } from "./memoFace";
import { t } from "@/i18n";
import type { Note } from "./db/schema";

/**
 * markdown(또는 블록 JSON) → 검색용 평문.
 *  - blocksToMarkdown으로 레거시 JSON 카드도 markdown으로 통일.
 *  - markdown 기호(제목·강조·코드펜스·링크·리스트 마커 등) 제거.
 *  - 공백 정규화 + 소문자화 → 대소문자·기호 무시 매칭(AC-1).
 */
export function plainText(markdown: string): string {
  return plainTextRaw(markdown).toLowerCase();
}

/**
 * markdown(또는 블록 JSON) → 검색·미리보기용 평문. 대소문자는 보존한다
 * ([[plainText]]는 검색용으로 소문자화한 결과를 돌려준다).
 */
export function plainTextRaw(markdown: string): string {
  // The reserved value is internal only as a complete body. Code/prose stays searchable.
  if (markdown === EMPTY_LINK_CONTENT) return "";
  return markdownText(markdown);
}

/** Fragment conversion must not mistake user text for a whole-body sentinel. */
function markdownText(markdown: string): string {
  const md = blocksToMarkdown(markdown ?? "");
  if (!md) return "";
  let s = md;
  // 펜스 코드블록 ```lang\n...\n``` → 내부 코드만 남김
  s = s.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code: string) => code ?? "");
  // 이미지 ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 링크 [text](url) → text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // 위키링크 [[text]] → text
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // 인라인 코드 `code` → code
  s = s.replace(/`([^`]*)`/g, "$1");
  // 줄머리 제목(#)·인용(>)·리스트 마커(-/*/+, 1.) 제거
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");
  s = s.replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "");
  // 강조·취소선 마커 제거
  s = s.replace(/[*_~]/g, "");
  // 공백 정규화(대소문자 보존)
  return s.replace(/\s+/g, " ").trim();
}

export type MemoType = "memo" | "todo" | "link" | "photo" | "textbox";
export interface MemoPresentation {
  type: MemoType;
  typeLabel: string;
  empty: boolean;
  emptyLabel: string;
  displayTitle: string;
  /** Readable preview, without todo storage syntax. */
  preview: string;
  /** Authored title/body plus visible semantic labels, never persisted. */
  searchText: string;
}

type Presentable = Pick<Note, "kind" | "content" | "title" | "overlay" | "attachmentRef">;

function hasInk(overlay: string | undefined): boolean {
  if (!overlay) return false;
  try {
    const parsed = JSON.parse(overlay) as { paths?: unknown[] };
    return Array.isArray(parsed.paths) && parsed.paths.some(p => Array.isArray(p) && p.length > 0);
  } catch {
    return false;
  }
}

/** Read-only view model shared by canvas search and table rows. */
export function presentMemo(note: Presentable, raw: string): MemoPresentation {
  const face = note.kind === "text" ? memoFace(note.content) : null;
  const type: MemoType = note.kind === "photo" ? "photo" : note.kind === "textbox" ? "textbox"
    : face?.t === "todo" ? "todo" : face?.t === "link" || face?.t === "linkEmpty" ? "link" : "memo";
  const typeLabel = t(`reviewTable.type.${type}`);
  const title = note.title?.trim() ?? "";
  const counts = note.kind === "text" ? countBlocks(note.content) : null;
  const attached = !!note.attachmentRef || !!(counts && (counts.image + counts.link + counts.audio + counts.file));
  const ink = hasInk(note.overlay);
  const todo = face?.t === "todo" ? face.items : null;
  const body = todo ? todo.map(item => markdownText(item.text)).filter(Boolean).join(" · ") : raw;
  const completed = todo?.filter(item => item.done).length ?? 0;
  const empty = !title && !body.trim() && !attached && !ink && completed === 0;
  const emptyLabel = empty ? t(`reviewTable.empty.${type}`) : "";
  const progress = todo ? t("reviewTable.todoProgress", { completed, total: todo.length }) : "";
  const fallback = ink ? t("reviewTable.drawing") : attached ? t("reviewTable.attachmentContent") : progress || typeLabel;
  // Titles are derived for display only; title edit and sort still use note.title.
  const firstLine = todo ? todo.find(item => markdownText(item.text).trim())?.text
    : blocksToMarkdown(note.content).split("\n").map(line => line.trim()).find(line => line && !/^(`{3,}|~{3,})/.test(line) && markdownText(line));
  const firstText = face?.t === "linkEmpty" ? "" : type === "link" && face?.t === "link" ? face.title
    : type === "photo" || type === "textbox" ? note.content.split("\n").find(line => line.trim())
    : firstLine ? markdownText(firstLine) : "";
  const displayTitle = title || (empty ? emptyLabel : firstText?.trim()) || fallback;
  const bodyHint = face?.t === "linkEmpty" ? t("reviewTable.empty.link")
    : ink ? t("reviewTable.drawing") : attached ? t("reviewTable.attachmentContent") : "";
  const preview = empty ? emptyLabel : [progress, body || bodyHint].filter(Boolean).join(" · ");
  const url = face?.t === "link" ? face.url : "";
  const emptyType = empty ? t("reviewTable.emptyType", { type: typeLabel }) : "";
  return {
    type, typeLabel, empty, emptyLabel, displayTitle, preview,
    searchText: [title, body || bodyHint, typeLabel, emptyLabel, emptyType, progress, url].filter(Boolean).join(" "),
  };
}
