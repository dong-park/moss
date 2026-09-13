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
 * 2단계 리뷰 P1-7: 오디오/파일 blob URL 캐시는 LRU(상한 BLOB_URL_CACHE_LIMIT)로
 * 관리한다 — 밀려나는 항목은 즉시, 전체는 마지막 에디터가 unmount될 때 revoke한다.
 * 캐시가 모듈 전역이라 에디터 하나의 destroy에서 전부 revoke하면 동시에 열린 다른
 * 에디터(n5 앞면 여러 장 + 메모 창)의 blob URL이 끊긴다 → 마운트 수를 센다.
 * ───────────────────────────────────────────────────────────── */

import { Plugin } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { $prose } from "@milkdown/utils";

import { getBlobUrl } from "@/state/db/opfs";
import { classifyLinkMark, type Block } from "@/state/blocks";
import { t } from "@/i18n";

/** 이 모듈이 다루는 블록 — 이미지는 opfsImagePlugin(실제 스키마 노드)이 그린다. */
export type ParagraphBlock = Exclude<Block, { type: "image" }>;

/**
 * 문단 노드 하나가 링크·녹음·파일 블록인지 구조적으로 판정한다(이미지 제외).
 * 2단계 리뷰 P1-5: 판정 로직은 state/blocks.ts의 classifyLinkMark 하나뿐이다 —
 * parseBlock(마크다운 정규식)도 같은 함수를 쓴다.
 */
export function paragraphBlock(node: ProseNode): ParagraphBlock | null {
  if (node.type.name !== "paragraph" || node.childCount !== 1) return null;
  const child = node.child(0);
  if (!child.isText || !child.text) return null;
  const mark = child.marks.find((m) => m.type.name === "link");
  if (!mark) return null;
  const title = typeof mark.attrs.title === "string" ? mark.attrs.title : "";
  const href = typeof mark.attrs.href === "string" ? mark.attrs.href : "";
  const label = child.text;
  return classifyLinkMark({ title, href, label }) as ParagraphBlock | null;
}

/* ── blob URL 캐시(LRU, 상한 있음 — 2단계 리뷰 P1-7) ────────────── */
const BLOB_URL_CACHE_LIMIT = 32;
const blobUrlCache = new Map<string, Promise<string | null>>();

function evictOldestIfNeeded(): void {
  while (blobUrlCache.size > BLOB_URL_CACHE_LIMIT) {
    const oldestKey = blobUrlCache.keys().next().value;
    if (oldestKey === undefined) break;
    const pending = blobUrlCache.get(oldestKey);
    blobUrlCache.delete(oldestKey);
    void pending?.then((url) => {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }
}

function resolveBlobUrl(ref: string): Promise<string | null> {
  let p = blobUrlCache.get(ref);
  if (p) {
    // LRU: 다시 접근했으니 맨 뒤로(Map은 삽입 순서를 유지한다).
    blobUrlCache.delete(ref);
    blobUrlCache.set(ref, p);
    return p;
  }
  p = getBlobUrl(ref);
  blobUrlCache.set(ref, p);
  evictOldestIfNeeded();
  return p;
}

/** 이 플러그인을 쓰는 에디터 뷰 수. 0이 되면 캐시 전체를 revoke한다. */
let mountedViews = 0;

/** 마지막 에디터가 unmount될 때 캐시 전체를 revoke한다. */
function revokeAllCachedBlobUrls(): void {
  for (const [, pending] of blobUrlCache) {
    void pending.then((url) => {
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }
  blobUrlCache.clear();
}

/* ── 파일 블록 "열기" 판정(2단계 리뷰 사용자 결정) ───────────────
 * PDF·이미지(svg 제외)·오디오·text/plain만 새 탭(window.open). 그 외(html·svg·
 * 기타)는 <a download> 강제 다운로드 — svg·html은 스크립트를 담을 수 있어 새 탭
 * 열람 대신 다운로드를 강제한다. 파일 본체 MIME을 저장하지 않으므로 파일명
 * 확장자로 판정한다. */
const OPEN_IN_TAB_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "mp3",
  "wav",
  "ogg",
  "oga",
  "m4a",
  "webm",
  "aac",
  "txt",
]);

export function shouldOpenFileInNewTab(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return OPEN_IN_TAB_EXTENSIONS.has(ext);
}

function openOrDownload(url: string, filename: string): void {
  if (shouldOpenFileInNewTab(filename)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
        openOrDownload(url, block.filename);
      })();
    });
    row.append(openBtn);
  }
  return row;
}

/* ── 데코레이션 — 원문 숨김 + 위젯(spec §11) ───────────────────────
 * 2단계 리뷰 P1-4: 위젯 key는 위치(pos)가 아니라 블록 내용(ref/url)으로 고정한다.
 * pos 기반 key는 블록보다 앞선 텍스트를 편집할 때마다(위치가 밀리며) 바뀌어
 * 위젯 DOM 인스턴스가 매번 재생성됐다(재생 중이던 audio가 끊기는 등).
 *
 * 재계산은 `state.doc` 객체 참조가 바뀔 때만 한다(ProseMirror doc은 불변이라
 * 문서가 실제로 바뀐 트랜잭션에서만 새 참조가 생긴다 — 커서 이동 등 selection-only
 * 트랜잭션은 참조가 같아 캐시를 그대로 재사용한다). plugin `state.init`은 아직
 * EditorView가 없어 `view.editable`(readonly)을 알 수 없는 시점에 실행되므로,
 * 공식 plugin state 필드 대신 `decorations()` prop 안에서 실제 값을 읽어 캐시를
 * 검증하는 방식을 썼다 — init 시점에 readonly=false로 잘못 굳는 문제를 피한다. */

function blockWidgetKey(block: ParagraphBlock): string {
  if (block.type === "link") return `moss-blk-link-${block.url}`;
  if (block.type === "audio") return `moss-blk-audio-${block.ref}`;
  return `moss-blk-file-${block.ref}`;
}

function buildBlockDecorations(doc: ProseNode, readonly: boolean): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    const block = paragraphBlock(node);
    if (!block) return;
    const child = node.child(0);
    const start = pos + 1;
    const end = start + child.nodeSize;
    decos.push(Decoration.inline(start, end, { style: "display:none;" }));
    decos.push(
      Decoration.widget(start, () => buildBlockWidget(block, { readonly }), {
        side: -1,
        key: blockWidgetKey(block),
      }),
    );
    return false; // 단일 텍스트 자식 — 더 내려갈 것 없음.
  });
  return DecorationSet.create(doc, decos);
}

export const memoBlockDecorations = $prose(() => {
  let currentView: EditorView | null = null;
  let cache: { doc: ProseNode; readonly: boolean; set: DecorationSet } | null = null;

  return new Plugin({
    props: {
      decorations(state) {
        const readonly = currentView ? !currentView.editable : false;
        if (!cache || cache.doc !== state.doc || cache.readonly !== readonly) {
          cache = { doc: state.doc, readonly, set: buildBlockDecorations(state.doc, readonly) };
        }
        return cache.set;
      },
    },
    view(view) {
      currentView = view;
      mountedViews += 1;
      return {
        update(v) {
          currentView = v;
        },
        destroy() {
          currentView = null;
          cache = null;
          mountedViews = Math.max(0, mountedViews - 1);
          if (mountedViews === 0) revokeAllCachedBlobUrls();
        },
      };
    },
  });
});
