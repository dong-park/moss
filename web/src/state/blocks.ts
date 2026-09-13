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
 * 않고 state/db/opfsRef.ts의 toStorageRef/toMarkdownUrl을 쓴다(에디터 의존 없음).
 *
 * 링크 URL은 http·https·mailto만 블록으로 인정한다. 다른 스킴(javascript: 등)은
 * 직렬화를 거부하고 파싱에서 null — 저장형 XSS 차단(리뷰 P1).
 */

import { toMarkdownUrl, toStorageRef } from "@/state/db/opfsRef";

/** 녹음 블록의 label은 항상 고정 문자열이다(spec §11 표). */
const AUDIO_LABEL = "녹음";

export type Block =
  | { type: "image"; ref: string }
  | { type: "link"; url: string; title?: string }
  | { type: "audio"; ref: string }
  | { type: "file"; ref: string; filename: string };

export type BlockType = Block["type"];

/** 문단 단독 링크 마크의 title 표식 — 이 셋만 블록 후보(그 외는 일반 링크). */
export const BLOCK_LINK_TITLES = new Set(["moss-link", "moss-audio", "moss-file"]);

/**
 * link 마크 하나(문단 단독)의 title·href·label을 블록으로 판정한다(spec §11).
 * blockView.ts의 paragraphBlock(ProseMirror 노드)과 parseBlock(마크다운 정규식) 둘
 * 다 이 함수 하나만 거쳐 같은 판정을 내린다(2단계 리뷰 P1-5 — 판정 이원화 금지).
 */
export function classifyLinkMark(input: {
  title: string;
  href: string;
  label: string;
}): Exclude<Block, { type: "image" }> | null {
  const { title, href, label } = input;
  if (!BLOCK_LINK_TITLES.has(title)) return null;

  if (title === "moss-audio") {
    if (!href.startsWith("opfs://")) return null;
    return { type: "audio", ref: toStorageRef(href) };
  }
  if (title === "moss-file") {
    if (!href.startsWith("opfs://")) return null;
    return { type: "file", ref: toStorageRef(href), filename: label };
  }
  // moss-link — 정규형(허용 스킴 + 인코딩)일 때만 블록 — 아니면 그냥 링크 텍스트로
  // 남긴다(저장형 XSS 방지, n2 재심사 P1과 동일 기준). title은 label이 있으면 그대로
  // 쓴다(빈 라벨이면 undefined) — 렌더는 `block.title ?? block.url`이라 label===href여도
  // 문제 없다(단순화, 2단계 리뷰 P1-5).
  if (normalizeLinkUrl(href) !== href) return null;
  return { type: "link", url: href, title: label || undefined };
}

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
  // 개행·제어문자는 블록을 두 줄로 쪼개 복구 불가로 만든다 → 공백으로(리뷰 P1).
  const oneLine = label.replace(/[\u0000-\u001f\u007f]+/g, " ");
  return oneLine.replace(/[\\\]"()]/g, (m) => "\\" + m);
}

function unescapeLabel(label: string): string {
  return label.replace(/\\(.)/g, "$1");
}

/* ── 링크 URL ───────────────────────────────────────────────── */

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** 허용 스킴이면 공백·따옴표·괄호를 퍼센트 인코딩한 URL, 아니면 null. */
export function normalizeLinkUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!ALLOWED_LINK_PROTOCOLS.has(url.protocol)) return null;
  // href 대신 원문을 쓴다 — 정규화(끝 슬래시 추가 등)가 사용자가 쓴 URL을 바꾸지 않게.
  return raw
    .trim()
    .replace(/[\s"()]/g, (m) => "%" + m.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

/* ── 직렬화 ──────────────────────────────────────────────────── */

/**
 * 블록을 한 줄 마크다운으로. 링크 URL이 허용 스킴이 아니면 null —
 * 호출자는 블록 대신 일반 텍스트로 남긴다.
 */
export function serializeBlock(block: Exclude<Block, { type: "link" }>): string;
export function serializeBlock(block: Block): string | null;
export function serializeBlock(block: Block): string | null {
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
      const url = normalizeLinkUrl(block.url);
      if (!url) return null;
      const rawTitle = block.title && block.title.trim() ? block.title : block.url.trim();
      return `[${escapeLabel(rawTitle)}](${url} "moss-link")`;
    }
  }
}

/* ── 파싱 ────────────────────────────────────────────────────── */

const IMAGE_RE = /^!\[\]\((opfs:\/\/\S+)\)$/;
const AUDIO_RE = new RegExp(`^\\[${AUDIO_LABEL}\\]\\((opfs:\\/\\/\\S+) "moss-audio"\\)$`);
/** 라벨은 escapeLabel 결과만 인정한다 — 이스케이프 안 된 `\ ] " ( )`가 있으면 불일치. */
const LABEL = String.raw`((?:[^\\\]"()]|\\.)*)`;
const FILE_RE = new RegExp(String.raw`^\[${LABEL}\]\((opfs:\/\/\S+) "moss-file"\)$`);
const LINK_RE = new RegExp(String.raw`^\[${LABEL}\]\((\S+) "moss-link"\)$`);

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
  if (m) return classifyLinkMark({ title: "moss-audio", href: m[1], label: AUDIO_LABEL });

  m = FILE_RE.exec(s);
  if (m) {
    return classifyLinkMark({
      title: "moss-file",
      href: m[2],
      label: unescapeLabel(m[1]),
    });
  }

  m = LINK_RE.exec(s);
  if (m) {
    return classifyLinkMark({
      title: "moss-link",
      href: m[2],
      label: unescapeLabel(m[1]),
    });
  }

  return null;
}

/* ── 문단 분리(2단계 리뷰 P1-5) ───────────────────────────────────
 * 블록은 "자기 문단(줄)에 단독으로" 있을 때만 블록이다. commonmark에서 진짜
 * 문단 경계는 빈 줄이다 — 빈 줄 없이 이어진 줄은 소프트 브레이크로 같은 문단에
 * 묶이고(에디터가 실제로 그렇게 파싱한다, n4 구현 메모 갭1), 이 경우 그 줄이
 * 블록 패턴과 글자 그대로 일치해도 블록이 아니다(같은 문단 안에 다른 텍스트가
 * 섞여 있어 실제로는 문단 노드의 자식이 여럿이라 blockView.paragraphBlock의
 * "문단 단독" 조건에 걸린다 — 여기서도 같은 기준을 지켜야 두 판정이 어긋나지
 * 않는다). 코드 펜스(``` ... ```) 안 줄도 블록으로 세지 않는다. */

function isFenceDelim(line: string): boolean {
  return /^\s*```/.test(line);
}

/** 블록 후보로 셀 수 있는 "고립된 줄"만 골라 반환한다(펜스 제외, 위아래 빈 줄/경계). */
function isolatedBlockLines(markdown: string): string[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const isBoundary = (idx: number): boolean =>
    idx < 0 || idx >= lines.length || lines[idx].trim() === "" || isFenceDelim(lines[idx]);

  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceDelim(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "") continue;
    if (isBoundary(i - 1) && isBoundary(i + 1)) out.push(line);
  }
  return out;
}

/** 본문 안 블록 개수를 종류별로 센다. */
export function countBlocks(markdown: string): BlockCounts {
  const counts: BlockCounts = { image: 0, link: 0, audio: 0, file: 0 };
  for (const line of isolatedBlockLines(markdown)) {
    const block = parseBlock(line);
    if (block) counts[block.type] += 1;
  }
  return counts;
}

/**
 * 본문의 첫 번째(비어있지 않은) 문단이 이미지 블록인지. 앞면 레이아웃(spec §8-AC-8)이
 * 쓴다. 첫 문단이 코드 펜스거나 빈 줄 없이 다음 줄로 이어지면(소프트 브레이크로 한
 * 문단) 단독 블록이 아니므로 false.
 */
export function firstBlockIsImage(markdown: string): boolean {
  if (!markdown) return false;
  const lines = markdown.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceDelim(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "") continue;
    const nextIsBoundary =
      i === lines.length - 1 || lines[i + 1].trim() === "" || isFenceDelim(lines[i + 1]);
    if (!nextIsBoundary) return false; // 소프트 브레이크로 다음 줄과 같은 문단 — 단독 아님.
    return parseBlock(line)?.type === "image";
  }
  return false;
}
