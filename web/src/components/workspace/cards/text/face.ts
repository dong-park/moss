import { parseBlock } from "@/state/blocks";
import { blocksToMarkdown } from "@/state/cardContent";
import { EMPTY_LINK_CONTENT } from "../../linkMemo";

/**
 * 메모 앞면 모양 (spec/card-faces.md). 새 카드 종류 없이 본문으로 정한다.
 * - linkEmpty: 도크 링크 버튼이 만든 빈 카드 → 주소 입력칸
 * - link: 본문이 링크 블록 한 줄뿐 → 파비콘·사이트·제목 흰 카드
 * - todo: 빈 줄을 빼고 모든 줄이 체크박스 → 제목 + 체크리스트 흰 카드
 * - paper: 그 밖 → 정사각 포스트잇
 */
export type TodoItem = { text: string; done: boolean; line: number };
export type MemoFace =
  | { t: "paper" }
  | { t: "linkEmpty" }
  | { t: "link"; url: string; title: string; site: string }
  | { t: "todo"; items: TodoItem[] };

const TASK_RE = /^\s*[-*+] \[([ xX])\]\s?(.*)$/;

export function memoFace(content: string): MemoFace {
  if (content === EMPTY_LINK_CONTENT) return { t: "linkEmpty" };
  const md = blocksToMarkdown(content).trim();
  if (!md) return { t: "paper" };

  if (!md.includes("\n")) {
    const block = parseBlock(md);
    if (block?.type === "link") {
      let site = block.url;
      try {
        site = new URL(block.url).hostname.replace(/^www\./, "");
      } catch {
        /* mailto 등 — 주소 그대로 */
      }
      return { t: "link", url: block.url, title: block.title || block.url, site };
    }
  }

  const items: TodoItem[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const m = TASK_RE.exec(lines[i]);
    if (!m) return { t: "paper" };
    items.push({ text: m[2].replace(/\\(.)/g, "$1"), done: m[1] !== " ", line: i });
  }
  return { t: "todo", items };
}

