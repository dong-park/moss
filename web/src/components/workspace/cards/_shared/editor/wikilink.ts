/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-wikilinks (W5) — `[[위키링크]]` 플러그인 + 백링크 셀렉터.
 *
 * 메모 본문에 `[[제목]]` / `[[id|표시명]]` 위키링크를 달아 메모끼리 잇는다.
 * P0가 박은 editorPlugins[] 슬롯에 `...wikilink` 한 줄로 등록된다
 * ([[_squad-memo-production]] §조율점).
 *
 * 데이터 모델(spec §5): 링크는 본문 마크다운에 **literal 텍스트**로 남는다
 * (`[[id|표시명]]` 권장 · `[[제목]]` 허용). commonmark는 정의 없는 `[[...]]`를
 * 그대로 텍스트로 파싱·직렬화하므로 별도 노드 스키마/remark 직렬화기가 필요 없고
 * 마크다운 라운드트립이 무손실이다(persist 안전). 백링크 인덱스는 파생(persist X).
 *
 * 렌더(데코레이션, 스키마 불변):
 *  - 편집 모드: literal `[[...]]`에 ink-blue 밑줄 스타일만 입힌다(원문 편집 가능).
 *  - 읽기 모드: 원문을 숨기고(`display:none`) id로 조회한 **현재 제목**을 chip
 *    위젯으로 그린다 → 대상 제목이 바뀌면 표시도 갱신(AC-5). 클릭 시 점프(AC-2).
 *
 * id 기반 안정 참조 권장(AC-5): 자동완성은 항상 `[[id|제목]]`을 삽입하고,
 * 백링크/해소는 id 우선이라 대상 카드 제목이 바뀌어도 링크가 끊기지 않는다.
 * ───────────────────────────────────────────────────────────── */

import type { MilkdownPlugin } from "@milkdown/ctx";
import { Plugin } from "@milkdown/prose/state";
import type { EditorState } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

import { blocksToMarkdown } from "@/state/cardContent";
import { useWorkspace, type Card } from "@/state/workspace";

/* ── 토큰 파싱·해소 (순수 함수, 단위 테스트 대상) ───────────────── */

/** 닫힌 위키링크 1개를 잡는다. 줄바꿈·중첩 대괄호는 토큰에서 제외. */
const WIKILINK_RE = /\[\[([^[\]\n]+)\]\]/g;

export type WikiToken = { id: string; label: string } | { title: string };

/** `[[...]]` 안쪽 문자열을 id 기반 / 제목 기반 토큰으로 해석한다. */
export function parseWikilinkToken(inner: string): WikiToken {
  const bar = inner.indexOf("|");
  if (bar >= 0) {
    return { id: inner.slice(0, bar).trim(), label: inner.slice(bar + 1).trim() };
  }
  return { title: inner.trim() };
}

/** 메모(연결 대상) 후보 카드인지 — 글 카드만 위키링크 대상으로 본다. */
export function isMemoCard(card: Card): boolean {
  return card.kind === "text";
}

/**
 * 본문 마크다운 첫 비공백 줄에서 머리기호·강조 문자를 벗긴 것.
 * 레거시 블록 JSON 카드는 blocksToMarkdown으로 정규화 후 추출한다.
 * 제목이 없는 메모의 표시 이름 폴백 — 표시 이름 해석·백링크가 같은 규칙을 쓴다.
 */
function bodyFirstLine(card: Card): string {
  const md = blocksToMarkdown(card.content ?? "");
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line) return line.replace(/^#+\s*/, "").replace(/[*_`>~]/g, "").trim();
  }
  return "";
}

/**
 * 카드 표시 이름 — 제목이 있으면 제목, 없으면 본문 첫 줄.
 * 해석·백링크·chip·자동완성 목록·삽입 라벨이 모두 이 함수를 쓴다.
 * 제목은 저장 시 이미 trim되지만, 레거시/직접 주입 값의 공백만 제목도
 * 빈 것으로 보기 위해 trim 후 판정한다(경계 조건: 제목이 공백만이면 폴백).
 */
export function cardTitle(card: Card): string {
  const title = (card.title ?? "").trim();
  if (title) return title;
  return bodyFirstLine(card);
}

/** 토큰이 가리키는 카드를 찾는다. id 토큰은 id로, 제목 토큰은 표시 이름으로.
 *
 * 제목 토큰 해석은 두 단계다(경계 조건): 먼저 모든 메모의 표시 이름(제목,
 * 없으면 본문 첫 줄)에서 찾고, 못 찾으면 본문 첫 줄에서 한 번 더 찾는다.
 * 그래야 메모에 제목을 단 뒤에도 옛 `[[본문 첫 줄]]` 링크가 살아남는다.
 */
export function resolveWikilinkTarget(
  token: WikiToken,
  cards: Card[],
): Card | null {
  if ("id" in token) {
    return cards.find((c) => c.id === token.id) ?? null;
  }
  const want = token.title.toLowerCase();
  if (!want) return null;
  const memos = cards.filter(isMemoCard);
  return (
    memos.find((c) => cardTitle(c).toLowerCase() === want) ??
    memos.find((c) => bodyFirstLine(c).toLowerCase() === want) ??
    null
  );
}

/** 본문에 들어있는 모든 위키링크 토큰을 추출한다. */
export function extractWikilinkTokens(content: string): WikiToken[] {
  const out: WikiToken[] = [];
  for (const m of (content ?? "").matchAll(WIKILINK_RE)) {
    out.push(parseWikilinkToken(m[1]));
  }
  return out;
}

/** content가 targetId(또는 그 표시 이름/본문 첫 줄)를 위키링크로 가리키는가.
 * 제목 링크는 표시 이름과 본문 첫 줄 둘 다와 비교한다(해석과 같은 두 단계 규칙). */
function contentLinksTo(
  content: string,
  targetId: string,
  targetNamesLower: string[],
): boolean {
  for (const token of extractWikilinkTokens(content)) {
    if ("id" in token) {
      if (token.id === targetId) return true;
    } else {
      const want = token.title.toLowerCase();
      if (want && targetNamesLower.includes(want)) return true;
    }
  }
  return false;
}

/**
 * 백링크 셀렉터(AC-4) — cardId를 위키링크로 가리키는 카드들.
 * id 우선 매칭이라 대상 제목이 바뀌어도 역참조가 끊기지 않는다(AC-5).
 * 제목 링크는 표시 이름·본문 첫 줄 둘 다로 비교한다(경계 조건: 제목을 단 뒤에도
 * 옛 본문 첫 줄 링크가 잡힌다).
 * 파생 인덱스: 호출 시점 cards에서 즉시 계산(persist 안 함, spec §5).
 */
export function backlinksOf(cards: Card[], cardId: string): Card[] {
  const target = cards.find((c) => c.id === cardId);
  if (!target) return [];
  const namesLower = [cardTitle(target).toLowerCase(), bodyFirstLine(target).toLowerCase()].filter(
    (n) => n.length > 0,
  );
  return cards.filter(
    (c) => c.id !== cardId && contentLinksTo(c.content ?? "", cardId, namesLower),
  );
}

/**
 * 자동완성 트리거 감지(순수) — 커서 앞 텍스트에서 닫히지 않은 `[[질의`를 찾는다.
 * 매치 시 질의 문자열을, 아니면 null. (닫힌 `]]`가 끼면 트리거 아님.)
 */
export function findActiveQuery(textBeforeCursor: string): string | null {
  const m = /\[\[([^[\]\n]*)$/.exec(textBeforeCursor);
  return m ? m[1] : null;
}

/* ── 점프(AC-2) ────────────────────────────────────────────────
 * 대상 카드를 선택하고 뷰포트를 그 카드 중심으로 옮긴다. 현재 보드에 없는
 * 카드면 no-op. 브라우저 전용(window 가드). */
export function jumpToCard(cardId: string): void {
  const store = useWorkspace.getState();
  const card = store.cards.find((c) => c.id === cardId);
  if (!card) return;
  store.selectOne(cardId);
  if (typeof window === "undefined") return;
  const { x: vx, y: vy, scale } = store.viewport;
  const cx = card.x + card.width / 2;
  const cy = card.y + (card.height ?? 80) / 2;
  const screenX = cx * scale + vx;
  const screenY = cy * scale + vy;
  store.panBy(window.innerWidth / 2 - screenX, window.innerHeight / 2 - screenY);
}

/* ── 시각 스타일(인라인, 외부 CSS 의존 X) ─────────────────────── */
export const WIKILINK_CLASS = "moss-wikilink";
const INK_BLUE = "#3b5bdb";
const LINK_STYLE = `color:${INK_BLUE};text-decoration:underline;text-underline-offset:2px;cursor:pointer;`;
const DANGLING_STYLE =
  "color:#9aa0a9;text-decoration:underline dotted;text-underline-offset:2px;cursor:pointer;";

function previewOf(card: Card): string {
  const md = blocksToMarkdown(card.content ?? "").replace(/\s+/g, " ").trim();
  return md.length > 80 ? `${md.slice(0, 80)}…` : md;
}

/* ── ① 데코레이션 플러그인 — 링크 스타일 / 읽기 모드 chip ─────── */

function buildDecorations(state: EditorState, editable: boolean): DecorationSet {
  const cards = useWorkspace.getState().cards;
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(WIKILINK_RE)) {
      const start = pos + (m.index ?? 0);
      const end = start + m[0].length;
      const token = parseWikilinkToken(m[1]);
      const target = resolveWikilinkTarget(token, cards);
      if (editable) {
        // 편집 중: 원문 유지 + 링크 스타일만(원문을 직접 고칠 수 있게).
        decos.push(
          Decoration.inline(start, end, {
            class: WIKILINK_CLASS,
            style: target ? LINK_STYLE : DANGLING_STYLE,
          }),
        );
        continue;
      }
      // 읽기 모드: 원문 숨김 + 현재 제목 chip(클릭 점프).
      const display =
        (target ? cardTitle(target) : "") ||
        ("label" in token ? token.label : token.title) ||
        "";
      decos.push(Decoration.inline(start, end, { style: "display:none;" }));
      decos.push(
        Decoration.widget(
          start,
          () => buildChip(display, target),
          { side: -1, key: `wl-${start}-${display}-${target ? target.id : "x"}` },
        ),
      );
    }
  });
  return DecorationSet.create(state.doc, decos);
}

function buildChip(display: string, target: Card | null): HTMLElement {
  const span = document.createElement("span");
  span.className = WIKILINK_CLASS;
  span.textContent = display;
  span.style.cssText = target ? LINK_STYLE : DANGLING_STYLE;
  span.setAttribute("data-wikilink", target ? target.id : "");
  if (target) span.title = previewOf(target);
  // preventDefault+stopPropagation: 클릭이 카드 드래그/선택·에디터 포커스를
  // 가로채지 않고 "점프"로만 작동하게(읽기 모드 카드 위에 떠 있으므로).
  span.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  span.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (target) jumpToCard(target.id);
  });
  return span;
}

const wikilinkDecorations = $prose(() => {
  // props.decorations(state)는 view를 받지 못하므로, view를 클로저에 잡아
  // editable을 읽는다(편집/읽기 렌더 분기). editable 토글 시 에디터가 통째로
  // 재마운트되므로(MarkdownEditor deps) 클로저는 항상 현재 세션과 일치한다.
  let currentView: EditorView | null = null;
  return new Plugin({
    props: {
      decorations(state) {
        return buildDecorations(state, currentView?.editable ?? false);
      },
    },
    view(view) {
      currentView = view;
      return {
        destroy() {
          currentView = null;
        },
      };
    },
  });
});

/* ── ② 자동완성 플러그인 (AC-1·AC-3) ──────────────────────────
 * `[[` 입력 시 제목 매칭 메모 드롭다운 + "새 메모 만들기". ↑↓ Enter Esc.
 * 드롭다운은 document.body에 fixed로 띄우고 caret 좌표(coordsAtPos)에 붙인다. */

type AcItem =
  | { kind: "card"; card: Card }
  | { kind: "create"; query: string };

const acControllers = new WeakMap<EditorView, AutocompleteController>();
const MAX_CANDIDATES = 8;

class AutocompleteController {
  private view: EditorView;
  private dom: HTMLDivElement;
  private open = false;
  private items: AcItem[] = [];
  private active = 0;
  private from = 0;
  private to = 0;

  constructor(view: EditorView) {
    this.view = view;
    this.dom = document.createElement("div");
    this.dom.className = "moss-wikilink-ac";
    this.dom.style.cssText =
      "position:fixed;z-index:60;min-width:180px;max-width:300px;max-height:240px;overflow:auto;" +
      "border:1px solid var(--border,#d8d8d8);background:var(--surface,#fff);border-radius:8px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;font-size:13px;display:none;";
    document.body.appendChild(this.dom);
  }

  update(view: EditorView): void {
    this.view = view;
    if (!view.editable) return this.close();
    const sel = view.state.selection;
    if (!sel.empty) return this.close();
    const { $from } = sel;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const query = findActiveQuery(before);
    if (query === null) return this.close();

    const q = query.trim().toLowerCase();
    const cards = useWorkspace.getState().cards;
    const matches = cards
      .filter((c) => isMemoCard(c) && cardTitle(c))
      .filter((c) => (q ? cardTitle(c).toLowerCase().includes(q) : true))
      .slice(0, MAX_CANDIDATES);

    const items: AcItem[] = matches.map((card) => ({ kind: "card", card }));
    if (query.trim()) items.push({ kind: "create", query: query.trim() });
    if (items.length === 0) return this.close();

    this.items = items;
    this.active = Math.min(this.active, items.length - 1);
    this.from = sel.from - query.length - 2; // `[[` 포함 시작
    this.to = sel.from;
    this.open = true;
    this.render();
  }

  private render(): void {
    this.dom.innerHTML = "";
    this.items.forEach((item, i) => {
      const row = document.createElement("div");
      row.style.cssText =
        "padding:5px 8px;border-radius:5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" +
        (i === this.active ? "background:var(--panel,#eef);" : "");
      row.textContent =
        item.kind === "card" ? cardTitle(item.card) : `+ 새 메모 "${item.query}"`;
      if (item.kind === "create") row.style.color = INK_BLUE;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.confirm(i);
      });
      this.dom.appendChild(row);
    });
    const coords = this.view.coordsAtPos(this.to);
    this.dom.style.left = `${Math.round(coords.left)}px`;
    this.dom.style.top = `${Math.round(coords.bottom + 4)}px`;
    this.dom.style.display = "block";
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.open) return false;
    switch (event.key) {
      case "ArrowDown":
        this.active = (this.active + 1) % this.items.length;
        this.render();
        return true;
      case "ArrowUp":
        this.active = (this.active - 1 + this.items.length) % this.items.length;
        this.render();
        return true;
      case "Enter":
      case "Tab":
        this.confirm(this.active);
        return true;
      case "Escape":
        this.close();
        return true;
      default:
        return false;
    }
  }

  private confirm(index: number): void {
    const item = this.items[index];
    if (!item) return this.close();
    let insert: string;
    if (item.kind === "create") {
      // 새 메모 생성(AC-3): 현재 뷰포트 중앙에 글 카드를 만들고 질의를 제목으로 채운다.
      const newId = this.view.editable
        ? useWorkspace.getState().addCardAtViewportCenter("text")
        : "";
      if (newId) useWorkspace.getState().setContent(newId, item.query);
      insert = newId ? `[[${newId}|${item.query}]]` : `[[${item.query}]]`;
    } else {
      insert = `[[${item.card.id}|${cardTitle(item.card)}]]`;
    }
    const tr = this.view.state.tr.insertText(insert, this.from, this.to);
    this.view.dispatch(tr);
    this.close();
    this.view.focus();
  }

  close(): void {
    if (!this.open && this.dom.style.display === "none") return;
    this.open = false;
    this.active = 0;
    this.dom.style.display = "none";
  }

  destroy(): void {
    this.close();
    this.dom.remove();
    acControllers.delete(this.view);
  }
}

const wikilinkAutocomplete = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          return acControllers.get(view)?.handleKeyDown(event) ?? false;
        },
      },
      view(view) {
        const ctl = new AutocompleteController(view);
        acControllers.set(view, ctl);
        return {
          update: (v) => ctl.update(v),
          destroy: () => ctl.destroy(),
        };
      },
    }),
);

/** editorPlugins[]에 `...wikilink`로 등록(spec §6). 데코레이션 + 자동완성. */
export const wikilink: MilkdownPlugin[] = [
  wikilinkDecorations,
  wikilinkAutocomplete,
];
