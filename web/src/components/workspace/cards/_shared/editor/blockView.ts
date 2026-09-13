"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n4 — 링크·녹음·파일 블록 렌더(데코레이션).
 *
 * 이미지는 이미 실제 스키마 노드(image)라 opfsImagePlugin의 NodeView가 그린다.
 * 링크·녹음·파일은 commonmark 스키마에서 "문단 + link 마크"로만 존재하므로(별도
 * 노드 타입 없음) NodeView 대신 wikilink.ts와 같은 데코레이션 패턴을 쓴다 —
 * 원문(link 마크 텍스트)을 숨기고 그 자리에 위젯을 그린다.
 *
 * 인식(n2 parseBlock과 동일한 검증자 재사용, spec §11):
 *  - 문단이 텍스트 자식 1개 + link 마크 하나로만 이루어져 있을 때만("문단 단독").
 *  - mark.attrs.title이 moss-link/moss-audio/moss-file 중 하나.
 *  - moss-link는 normalizeLinkUrl(href)===href(정규형·허용 스킴)일 때만 블록 —
 *    아니면 그냥 링크 텍스트로 남는다(저장형 XSS 방지, n2 재심사 P1과 동일 기준).
 *
 * readonly: view.editable=false(카드 앞면 등 읽기 전용 컨텍스트)면 재생·열기
 * 컨트롤을 숨기고 흐린 색으로 그린다. 박스 크기(높이)는 readonly 여부와 무관하게
 * 동일해야 한다(n5 앞면 펜 좌표 1:1 규칙, spec §11 /hate 반영).
 *
 * 알려진 갭(구현 메모 참고): 오디오/파일 blob URL은 세션 동안 캐시하고 명시적으로
 * revoke하지 않는다 — OpfsImageNodeView처럼 destroy 훅에서 회수하지 않음(위젯이
 * DecorationSet 재생성 때마다 재사용되는지 보장이 약해 회수 시점을 안전하게 잡기
 * 어려움). 세션 중 다량의 첨부를 열면 누적 leak 가능 — n10 마무리에서 재검토.
 * ───────────────────────────────────────────────────────────── */

import { Plugin } from "@milkdown/prose/state";
import type { EditorState } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { $prose } from "@milkdown/utils";

import { getBlobUrl } from "@/state/db/opfs";
import { toStorageRef } from "@/state/db/opfsRef";
import { normalizeLinkUrl, type Block } from "@/state/blocks";
import { t } from "@/i18n";

const BLOCK_TITLES = new Set(["moss-link", "moss-audio", "moss-file"]);

/** 이 모듈이 다루는 블록 — 이미지는 opfsImagePlugin(실제 스키마 노드)이 그린다. */
export type ParagraphBlock = Exclude<Block, { type: "image" }>;

/** 문단 노드 하나가 링크·녹음·파일 블록인지 구조적으로 판정한다(이미지 제외). */
export function paragraphBlock(node: ProseNode): ParagraphBlock | null {
  if (node.type.name !== "paragraph" || node.childCount !== 1) return null;
  const child = node.child(0);
  if (!child.isText || !child.text) return null;
  const mark = child.marks.find((m) => m.type.name === "link");
  if (!mark) return null;
  const title = typeof mark.attrs.title === "string" ? mark.attrs.title : "";
  if (!BLOCK_TITLES.has(title)) return null;
  const href = typeof mark.attrs.href === "string" ? mark.attrs.href : "";
  const label = child.text;

  if (title === "moss-audio") {
    if (!href.startsWith("opfs://")) return null;
    return { type: "audio", ref: toStorageRef(href) };
  }
  if (title === "moss-file") {
    if (!href.startsWith("opfs://")) return null;
    return { type: "file", ref: toStorageRef(href), filename: label };
  }
  // moss-link — 정규형(허용 스킴 + 인코딩)일 때만 블록.
  if (normalizeLinkUrl(href) !== href) return null;
  return { type: "link", url: href, title: label !== href ? label : undefined };
}

/* ── blob URL 캐시(세션 한정, revoke 없음 — 위 갭 참고) ─────────── */
const blobUrlCache = new Map<string, Promise<string | null>>();
function resolveBlobUrl(ref: string): Promise<string | null> {
  let p = blobUrlCache.get(ref);
  if (!p) {
    p = getBlobUrl(ref);
    blobUrlCache.set(ref, p);
  }
  return p;
}

const ROW_STYLE =
  "display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;" +
  "border:1px solid var(--color-border,#ddd);border-radius:6px;" +
  "background:var(--color-panel,#f7f7f7);font-size:12px;" +
  "color:var(--color-text,#222);box-sizing:border-box;";

const CTRL_BTN_STYLE =
  "border:1px solid var(--color-border,#ccc);border-radius:4px;background:none;" +
  "cursor:pointer;font-size:11px;padding:1px 6px;flex-shrink:0;";

function ellipsisSpan(text: string, extra = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  span.style.cssText = `flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${extra}`;
  return span;
}

/** 링크·녹음·파일 블록 위젯 DOM을 만든다. n5 앞면이 readonly:true로 재사용한다. */
export function buildBlockWidget(block: ParagraphBlock, opts: { readonly: boolean }): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-moss-block", block.type);
  row.setAttribute("contenteditable", "false");
  row.style.cssText = ROW_STYLE;
  if (opts.readonly) row.style.opacity = "0.6";

  if (block.type === "link") {
    const icon = document.createElement("span");
    icon.textContent = "🔗";
    icon.setAttribute("aria-hidden", "true");
    const label = ellipsisSpan(block.title ?? block.url, "font-weight:500;");
    const domain = document.createElement("span");
    domain.style.cssText = "color:var(--color-text-soft,#999);flex-shrink:0;";
    domain.textContent = (() => {
      try {
        return new URL(block.url).hostname;
      } catch {
        return block.url;
      }
    })();
    row.append(icon, label, domain);
    if (!opts.readonly) {
      row.style.cursor = "pointer";
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(block.url, "_blank", "noopener,noreferrer");
      });
    }
    return row;
  }

  if (block.type === "audio") {
    const icon = document.createElement("span");
    icon.textContent = "🎙️";
    icon.setAttribute("aria-hidden", "true");
    const label = ellipsisSpan(t("workspace.memoEditor.block.audioLabel"));
    row.append(icon, label);
    if (!opts.readonly) {
      const audioEl = document.createElement("audio");
      audioEl.style.display = "none";
      audioEl.preload = "none";
      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.setAttribute("data-moss-audio-play", "");
      playBtn.setAttribute("aria-label", t("workspace.memoEditor.block.play"));
      playBtn.textContent = "▶";
      playBtn.style.cssText = CTRL_BTN_STYLE;
      playBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      playBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void (async () => {
          if (!audioEl.src) {
            const url = await resolveBlobUrl(block.ref);
            if (!url) {
              label.textContent = t("workspace.memoEditor.block.notFound");
              return;
            }
            audioEl.src = url;
          }
          if (audioEl.paused) void audioEl.play();
          else audioEl.pause();
        })();
      });
      audioEl.addEventListener("play", () => {
        playBtn.textContent = "⏸";
        playBtn.setAttribute("aria-label", t("workspace.memoEditor.block.pause"));
      });
      const toPlay = () => {
        playBtn.textContent = "▶";
        playBtn.setAttribute("aria-label", t("workspace.memoEditor.block.play"));
      };
      audioEl.addEventListener("pause", toPlay);
      audioEl.addEventListener("ended", toPlay);
      row.append(playBtn, audioEl);
    }
    return row;
  }

  // file
  const icon = document.createElement("span");
  icon.textContent = "📎";
  icon.setAttribute("aria-hidden", "true");
  const label = ellipsisSpan(block.filename);
  row.append(icon, label);
  if (!opts.readonly) {
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.setAttribute("data-moss-file-open", "");
    openBtn.textContent = t("workspace.memoEditor.block.open");
    openBtn.style.cssText = CTRL_BTN_STYLE;
    openBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        const url = await resolveBlobUrl(block.ref);
        if (!url) {
          label.textContent = t("workspace.memoEditor.block.notFound");
          row.setAttribute("data-moss-file-missing", "");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      })();
    });
    row.append(openBtn);
  }
  return row;
}

/* ── 데코레이션 — 원문 숨김 + 위젯(spec §11) ───────────────────── */
function buildBlockDecorations(state: EditorState, readonly: boolean): DecorationSet {
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    const block = paragraphBlock(node);
    if (!block) return;
    const child = node.child(0);
    const start = pos + 1;
    const end = start + child.nodeSize;
    decos.push(Decoration.inline(start, end, { style: "display:none;" }));
    decos.push(
      Decoration.widget(start, () => buildBlockWidget(block, { readonly }), {
        side: -1,
        key: `moss-blk-${pos}-${block.type}`,
      }),
    );
    return false; // 단일 텍스트 자식 — 더 내려갈 것 없음.
  });
  return DecorationSet.create(state.doc, decos);
}

export const memoBlockDecorations = $prose(() => {
  let currentView: EditorView | null = null;
  return new Plugin({
    props: {
      decorations(state) {
        return buildBlockDecorations(state, currentView ? !currentView.editable : false);
      },
    },
    view(view) {
      currentView = view;
      return {
        update(v) {
          currentView = v;
        },
        destroy() {
          currentView = null;
        },
      };
    },
  });
});
