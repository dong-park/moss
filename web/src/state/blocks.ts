/**
 * FEAT-sticky-redesign n2 — 블록 마크다운 문법 모듈.
 *
 * 이미지·링크·녹음·파일 네 블록을 메모 본문(마크다운 단일 문자열) 안에 표준
 * 마크다운 이미지/링크 문법 + 제목 표식으로 적는다(spec §6·§11). UI 의존 없는
 * 순수 모듈 — 이관(n3)·창(n4)·앞면(n5)·붙여넣기(n6)가 모두 이 파일만 통해
 * 블록을 만들고 읽는다.
 *
 * 문법(spec §11 표):
 *  - 이미지: `![](opfs://<file>)`
 *  - 링크:   `[<title 또는 url>](<url> "moss-link")`
 *  - 녹음:   `[녹음](opfs://<file> "moss-audio")`
 *  - 파일:   `[<원본 파일명>](opfs://<file> "moss-file")`
 *
 * 블록은 "자기 문단(줄)에 단독으로 있을 때만" 블록이다. 문장 안에 섞인 같은
 * 모양의 링크는 parseBlock이 null을 반환해 일반 링크로 남긴다.
 *
 * OPFS 참조는 두 스킴을 오간다 — 어댑터(state/db/opfs)는 `opfs:<file>`(콜론
 * 1개), 마크다운 본문은 `opfs://<file>`(콜론+슬래시 2개). 변환은 복제하지
 * 않고 imagePaste.ts의 toStorageRef/toMarkdownUrl을 그대로 재사용한다.
 */

import {
  toMarkdownUrl,
  toStorageRef,
} from "@/components/workspace/cards/_shared/editor/imagePaste";

/** 녹음 블록의 label은 항상 고정 문자열이다(spec §11 표). */
const AUDIO_LABEL = "녹음";

export type Block =
  | { type: "image"; ref: string }
  | { type: "link"; url: string; title?: string }
  | { type: "audio"; ref: string }
  | { type: "file"; ref: string; filename: string };

export type BlockType = Block["type"];

export interface BlockCounts {
  image: number;
  link: number;
  audio: number;
  file: number;
}

/* ── 라벨(제목·파일명) 이스케이프 ─────────────────────────────
 * `]`·`"`·`\`는 마크다운 링크 문법을 깨거나(대괄호 종료) title 표식과
 * 충돌한다(따옴표). 역슬래시 1개로 이스케이프하고, 파싱 때 되돌린다. */
function escapeLabel(label: string): string {
  return label.replace(/[\\\]"]/g, (m) => "\\" + m);
}

function unescapeLabel(label: string): string {
  return label.replace(/\\(.)/g, "$1");
}

/* ── 직렬화 ──────────────────────────────────────────────────── */

export function serializeBlock(block: Block): string {
  switch (block.type) {
    case "image":
      return `![](${toMarkdownUrl(block.ref)})`;
    case "audio":
      return `[${AUDIO_LABEL}](${toMarkdownUrl(block.ref)} "moss-audio")`;
    case "file": {
      const label = escapeLabel(block.filename);
      return `[${label}](${toMarkdownUrl(block.ref)} "moss-file")`;
    }
    case "link": {
      const rawTitle = block.title && block.title.trim() ? block.title : block.url;
      return `[${escapeLabel(rawTitle)}](${block.url} "moss-link")`;
    }
  }
}

/* ── 파싱 ────────────────────────────────────────────────────── */

const IMAGE_RE = /^!\[\]\((opfs:\/\/\S+)\)$/;
const AUDIO_RE = /^\[녹음\]\((\S+) "moss-audio"\)$/;
const FILE_RE = /^\[(.*)\]\((\S+) "moss-file"\)$/;
const LINK_RE = /^\[(.*)\]\((\S+) "moss-link"\)$/;

/**
 * 문단 텍스트 하나가 네 블록 중 하나로 "단독"으로 있으면 Block을, 아니면
 * null을 반환한다. 문단 전체가 정확히 패턴과 일치해야 한다(부분 일치 불가) —
 * 이것이 "문장 안에 섞인 링크는 블록 아님"을 보장한다.
 */
export function parseBlock(paragraphText: string): Block | null {
  const s = paragraphText.trim();
  if (!s) return null;

  let m = IMAGE_RE.exec(s);
  if (m) return { type: "image", ref: toStorageRef(m[1]) };

  m = AUDIO_RE.exec(s);
  if (m) return { type: "audio", ref: toStorageRef(m[1]) };

  m = FILE_RE.exec(s);
  if (m) {
    return {
      type: "file",
      ref: toStorageRef(m[2]),
      filename: unescapeLabel(m[1]),
    };
  }

  m = LINK_RE.exec(s);
  if (m) {
    const title = unescapeLabel(m[1]);
    return { type: "link", url: m[2], title: title || undefined };
  }

  return null;
}

/* ── 문단 분리 ───────────────────────────────────────────────────
 * 블록은 마크다운 안에서 한 줄(문단)을 통째로 차지한다. 문단 경계는 줄바꿈
 * 하나로 충분하다 — 블록이 문장 중간에 섞이는 경우는 그 줄 자체가 패턴과
 * 불일치하므로 parseBlock이 이미 null로 걸러낸다. */
function splitParagraphs(markdown: string): string[] {
  if (!markdown) return [];
  return markdown.split("\n");
}

/** 본문 안 블록 개수를 종류별로 센다. */
export function countBlocks(markdown: string): BlockCounts {
  const counts: BlockCounts = { image: 0, link: 0, audio: 0, file: 0 };
  for (const line of splitParagraphs(markdown)) {
    const block = parseBlock(line);
    if (block) counts[block.type] += 1;
  }
  return counts;
}

/** 본문의 첫 번째(비어있지 않은) 문단이 이미지 블록인지. 앞면 레이아웃(spec §8-AC-8)이 쓴다. */
export function firstBlockIsImage(markdown: string): boolean {
  for (const line of splitParagraphs(markdown)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const block = parseBlock(trimmed);
    return block?.type === "image";
  }
  return false;
}
