"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-markdown-memo-pen — Milkdown 라이브 프리뷰(WYSIWYG) 래퍼.
 *
 * D1=라이브 프리뷰 / D2=Milkdown. source 진실은 마크다운 문자열이며
 * commonmark+gfm 프리셋이 타이핑하며 렌더한다(올서타이프).
 *
 * SSR 주의(web/AGENTS.md): ProseMirror는 브라우저 전용 → 서버/하이드레이션에는
 * 원문 폴백만 렌더하고, client에서만 Milkdown 인스턴스를 만든다(useIsClient).
 *
 * editable 토글:
 *  - editing=false → readonly. 카드 드래그/선택을 위해 입력 불가.
 *  - editing=true  → 편집 가능(더블클릭 진입). blur 시 onBlur.
 * editable이 바뀌면 에디터를 재생성(deps)해 최신 value로 다시 마운트한다.
 * 편집 중에는 value를 deps에서 제외해 키스트로크마다 remount(커서 소실)를 막는다.
 * ───────────────────────────────────────────────────────────── */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  serializerCtx,
} from "@milkdown/core";
import { listenerCtx } from "@milkdown/plugin-listener";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { TextSelection } from "@milkdown/prose/state";
import type { Node as ProseNode } from "@milkdown/prose/model";

import styles from "./memoMobile.module.css";
import { MEMO_CONTENT_WIDTH } from "./memoLayout";
import { editorPlugins, refreshBubble, setBubbleScrollEl } from "./editor/extensions";
import { markdownPlaceholder } from "./markdownPlaceholder";
import { BubbleMenuHost } from "./editor/BubbleMenuHost";
import { EditorRegion } from "./editor/EditorRegion";
import { registerMemoBodyFocus } from "./memoTitleFocus";
import { registerEditFlush } from "@/state/editFlush";

import "@milkdown/theme-nord/style.css";
import "prosemirror-view/style/prosemirror.css";

export type MarkdownEditorProps = {
  value: string;
  editable: boolean;
  onChange: (markdown: string) => void;
  /** blur 시 새 포커스 대상(relatedTarget)을 넘긴다 — 카드 스코프 blur 가드용(AC-3). */
  onBlur?: (relatedTarget: EventTarget | null) => void;
  // 펼치기 모달 본문이면 true — 포커스 링과 placeholder 힌트를 끈다(모달은
  // 항상 편집 모드라 링/힌트가 군더더기). 카드 인라인 편집은 그대로 유지.
  expanded?: boolean;
  /** 앞면 카드 id — 제목 줄 Enter가 이 카드의 본문으로 오도록 포커서를 등록한다(f4). */
  cardId?: string;
};

// 서버에선 false, client에선 true — setState-in-effect 없이 클라이언트 감지.
const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function MilkdownInner({ value, editable, onChange, onBlur, expanded, cardId }: MarkdownEditorProps) {
  // 콜백은 ref로 고정해 에디터 재생성 없이 최신 핸들러를 부른다.
  // ref 갱신은 render가 아닌 effect에서 (react-hooks/refs).
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
  });
  // cmd-z-undo n4: 마지막으로 내보낸 본문. flush와 리스너가 같은 글을 두 번 쓰지 않게 한다.
  const lastEmittedRef = useRef(value);
  const emit = (markdown: string) => {
    if (markdown === lastEmittedRef.current) return;
    lastEmittedRef.current = markdown;
    onChangeRef.current(markdown);
  };
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  });
  // cmd-z-undo 웨이브 3: 마지막으로 내보낸 시점의 문서. 처음 값은 편집기가 뜬 직후 문서다.
  // flush는 문자열이 아니라 이 문서로 판정한다 — 직렬화가 원문을 바꿔(끝 줄바꿈, `- `→`* `,
  // 이스케이프) 치지 않고 닫아도 다른 글로 보이기 때문이다.
  const lastDocRef = useRef<ProseNode | null>(null);

  const { get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => editable,
            handleDOMEvents: {
              ...prev.handleDOMEvents,
              // blur 대신 focusout — relatedTarget(새 포커스 대상)을 얻기 위함.
              // 리스너 플러그인의 blur는 대상을 못 실어 카드 스코프 가드가 불가능하다.
              focusout: (_view, event) => {
                onBlurRef.current?.((event as FocusEvent).relatedTarget);
                return false;
              },
            },
          }));
          const l = ctx.get(listenerCtx);
          // The listener's debounce survives editor destruction. Serialize only
          // while its view is alive; closing already flushes the final document.
          let destroyed = false;
          l.destroy(() => { destroyed = true; });
          l.updated((lctx, doc) => {
            if (destroyed) return;
            lastDocRef.current = doc;
            emitRef.current(lctx.get(serializerCtx)(doc));
          });
          // FEAT-card-entry-mode: 편집 진입(editable) 시 mount 직후 포커스 —
          // 더블클릭→첫 키스트로크 손실 방지. 제목 줄은 포커스를 뺏지 않는다(AC-2).
          l.mounted((mctx) => {
            const view = mctx.get(editorViewCtx);
            lastDocRef.current = view.state.doc;
            if (editable) view.focus();
          });
        })
        .config(nord)
        // 펼치기 모달은 placeholder 힌트를 끈다 — 그 외엔 카드와 동일.
        .use(
          expanded
            ? editorPlugins.filter((p) => p !== markdownPlaceholder)
            : editorPlugins,
        ),
    // editable 변화 시 재생성. readonly일 때만 value를 deps에 포함해
    // 외부 변경을 반영하고, 편집 중에는 제외해 커서를 보존.
    [editable, editable ? "" : value],
  );

  // f4: 제목 줄 Enter가 이 카드의 본문 맨 앞으로 갈 수 있게 포커서를 등록.
  useEffect(() => {
    if (!cardId) return;
    registerMemoBodyFocus(cardId, () => {
      const editor = get();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = view.state.tr.setSelection(
          TextSelection.atStart(view.state.doc),
        );
        view.dispatch(tr);
        view.focus();
      });
    });
    return () => registerMemoBodyFocus(cardId, null);
  }, [cardId, get]);

  // cmd-z-undo n4: 편집 묶음을 닫기 직전 스토어가 부른다. 리스너의 0.2초 디바운스에 남은
  // 본문을 지금 내보낸다 — 창을 닫으면 편집기가 destroy돼 그 글이 버려지기 때문이다.
  useEffect(() => {
    if (!editable) return;
    return registerEditFlush(() => {
      const editor = get();
      if (!editor) return;
      let markdown: string | undefined;
      editor.action((ctx) => {
        const { doc } = ctx.get(editorViewCtx).state;
        // 마지막으로 내보낸 뒤 문서가 그대로면 쓸 것이 없다(치지 않고 닫기).
        const last = lastDocRef.current;
        if (last === null || doc.eq(last)) return;
        markdown = ctx.get(serializerCtx)(doc);
        lastDocRef.current = doc;
      });
      if (markdown !== undefined) emitRef.current(markdown);
    });
  }, [editable, get]);

  return (
    <>
      <EditorRegion editable={editable} expanded={expanded}>
        <Milkdown />
      </EditorRegion>
      <BubbleMenuHost />
    </>
  );
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const isClient = useIsClient();
  if (!isClient) {
    // 서버/하이드레이션 폴백: 원문 마크다운을 그대로 — 내용 손실/깜빡임 최소화.
    return (
      <div className="whitespace-pre-wrap text-[13px] leading-6 text-text">
        {props.value}
      </div>
    );
  }
  return (
    <MilkdownProvider>
      <MilkdownInner {...props} />
    </MilkdownProvider>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-expand — 펼치기 모달 전용 에디터.
 * 항상 편집 가능한 Milkdown 본문. 상단 서식 툴바는 없다 — 글자를 긁으면 뜨는
 * 버블(BubbleMenuHost)로만 서식을 바꾼다. 스크롤하면 refreshBubble이 버블을 글자에 맞춘다.
 * 펜 슬롯 등이 같은 MilkdownProvider 아래 있어야 같은 인스턴스를 공유한다.
 *
 * 고정 폭 (펜 좌표): 본문을 고정 폭([[MEMO_CONTENT_WIDTH]]) 컬럼, 13px, padding 6/9로
 * 잡는다. 저장된 펜 선(card.overlay)이 이 컬럼 좌표라서, 폭·글꼴이 바뀌면 줄바꿈이 달라져
 * 기존 선이 다른 글자 위로 간다. 카드 앞면은 제목만 보이고 본문·펜은 이 창에서만 보인다.
 * Desktop keeps the canonical column. Mobile reflows only ink-free notes; ink
 * and drawing mode scale the entire canonical body, without changing wrapping.
 * Explicit 100% view enables intentional horizontal scrolling for detail work.
 *
 * overlay: 펜 그리기 레이어. 고정 폭 컬럼(relative) 안에 있어 absolute inset-0이
 * 컬럼을 1:1로 덮는다 — 저장된 선과 같은 좌표공간.
 * ───────────────────────────────────────────────────────────── */
export function ExpandedMarkdownEditor({
  value,
  onChange,
  overlay,
  titleSlot,
  canonical = true,
}: {
  value: string;
  onChange: (markdown: string) => void;
  overlay?: ReactNode;
  /** Ink or an active drawing tool requires the original 720px line wrapping. */
  canonical?: boolean;
  /** FEAT-memo-title: 본문 컬럼 위에 둘 제목 줄(스크롤 영역 안). */
  titleSlot?: ReactNode;
}) {
  const isClient = useIsClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [fullSize, setFullSize] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setFitScale(Math.min(1, entry.contentRect.width / MEMO_CONTENT_WIDTH));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isClient]);
  // 버블이 선택이 바뀔 때도 이 스크롤 영역의 보이는 범위로 위치를 정하게 등록한다.
  // 창 크기가 바뀌면 글자 좌표가 달라지므로 버블 위치도 다시 계산한다.
  useEffect(() => {
    setBubbleScrollEl(scrollRef.current);
    const onResize = () => {
      if (scrollRef.current) refreshBubble(scrollRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      setBubbleScrollEl(null);
    };
  }, [isClient]);

  // The same DOM/editor survives policy and viewport changes: selection, pending
  // saves and ProseMirror history must survive switching the pen or fit view.
  return (
    <div
      data-memo-layout={canonical ? "canonical" : "reflow"}
      data-memo-full-size={fullSize}
      className={styles.surface}
      style={{ "--memo-fit-scale": fitScale } as CSSProperties}
    >
      {canonical && (
        <button type="button" className={styles.scaleToggle}
          aria-pressed={fullSize} onClick={() => setFullSize(!fullSize)}>
          {fullSize ? `${Math.round(fitScale * 100)}%` : "100%"}
        </button>
      )}
      <div ref={scrollRef} className={`min-h-0 flex-1 overflow-auto ${styles.scroll}`}
        style={{ maxWidth: MEMO_CONTENT_WIDTH + 24, padding: 0 }}
        onScroll={() => { if (scrollRef.current) refreshBubble(scrollRef.current); }}>
        {/* Title is outside the scaled geometry so its touch target stays usable. */}
        {titleSlot}
        <div data-memo-body-column className={`moss-md relative text-[13px] ${styles.body}`}
          style={{ width: MEMO_CONTENT_WIDTH, padding: "6px 9px" }}>
          {isClient
            ? <MilkdownInner value={value} editable expanded onChange={onChange} />
            : <div className="whitespace-pre-wrap">{value}</div>}
          {overlay}
        </div>
      </div>
    </div>
  );
}
