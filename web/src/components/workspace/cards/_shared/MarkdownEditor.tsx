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
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
} from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";

import { MarkdownToolbar } from "./MarkdownToolbar";

import "@milkdown/theme-nord/style.css";
import "prosemirror-view/style/prosemirror.css";

export type MarkdownEditorProps = {
  value: string;
  editable: boolean;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
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

export function MilkdownInner({ value, editable, onChange, onBlur }: MarkdownEditorProps) {
  // 콜백은 ref로 고정해 에디터 재생성 없이 최신 핸들러를 부른다.
  // ref 갱신은 render가 아닌 effect에서 (react-hooks/refs).
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
  });

  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => editable,
          }));
          const l = ctx.get(listenerCtx);
          l.markdownUpdated((_, markdown) => onChangeRef.current(markdown));
          l.blur(() => onBlurRef.current?.());
          // FEAT-card-entry-mode: 편집 진입(editable) 시 mount 직후 포커스 —
          // 더블클릭→첫 키스트로크 손실 방지.
          l.mounted((mctx) => {
            if (editable) mctx.get(editorViewCtx).focus();
          });
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(listener),
    // editable 변화 시 재생성. readonly일 때만 value를 deps에 포함해
    // 외부 변경을 반영하고, 편집 중에는 제외해 커서를 보존.
    [editable, editable ? "" : value],
  );

  return <Milkdown />;
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
 * 상단 서식 프리셋 툴바 + 항상 편집 가능한 Milkdown 본문.
 * 툴바와 에디터가 같은 MilkdownProvider 아래 있어야 같은 인스턴스를 공유한다.
 *
 * 진짜 줌 (cycle 2026-05-28 c): contentWidth가 주어지면 본문을 그 폭의 논리
 * 좌표로 잡고 CSS transform: scale(k)로 통째로 확대한다(k=bodyWidth/contentWidth,
 * 상한 1.5x, ResizeObserver로 추적). 텍스트(HTML)와 펜(SVG viewBox)이 같은 k로
 * 함께 커져 카드에서 그린 위치가 모달에서도 그대로 유지된다 — 'pen이 글자 둘레를
 * 두른' 같은 관계가 보존된다. transform-origin: top-left. 1.5x 상한을 둔 이유:
 * 좁은 카드를 모달 폭에 꽉 채우면 글자가 2.5–3배 커져 일반 마크다운 노트 앱
 * 느낌이 깨진다. 상한 초과분은 우측 여백으로 둔다.
 *
 * overlay: 펜 그리기 레이어. relative 컨테이너 안에 있어 absolute inset-0이 본문
 * 영역만 덮는다. DrawingLayer는 viewBox(=카드 dimensions)를 받아 좌표를 픽셀과
 * 환산하므로 CSS scale과 자연스럽게 합쳐진다.
 * ───────────────────────────────────────────────────────────── */
export function ExpandedMarkdownEditor({
  value,
  onChange,
  overlay,
  contentWidth,
  contentHeight,
}: {
  value: string;
  onChange: (markdown: string) => void;
  overlay?: ReactNode;
  /** 카드 content box 논리 폭. 지정 시 본문을 이 폭으로 잡고 CSS scale로 확대. */
  contentWidth?: number;
  /** 카드 content box 논리 높이. 본문 minHeight로 사용(짧은 메모도 펜 영역 확보). */
  contentHeight?: number;
}) {
  const isClient = useIsClient();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // body 폭 / contentWidth → scale. ResizeObserver로 화면 크기·모달 폭 변화 추적.
  // MAX_SCALE로 상한 — 좁은 카드를 모달 폭에 꽉 채우면 글자가 과하게 커져
  // 일반 마크다운 노트 앱 느낌이 깨진다. 1.5x에서 캡, 나머지는 우측 여백.
  useLayoutEffect(() => {
    if (!isClient || !contentWidth) return;
    const el = bodyRef.current;
    if (!el) return;
    const MAX_SCALE = 1.5;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(MAX_SCALE, w / contentWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isClient, contentWidth]);

  if (!isClient) {
    // SSR/jsdom 폴백 — 원문 마크다운만 표시(ProseMirror 미생성).
    return (
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="moss-md h-full overflow-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-6 text-text">
          {value}
        </div>
        {overlay}
      </div>
    );
  }
  // contentWidth 없으면 원래 동작(스케일 없음).
  if (!contentWidth) {
    return (
      <MilkdownProvider>
        <MarkdownToolbar />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="moss-md h-full overflow-auto px-4 py-3">
            <MilkdownInner value={value} editable onChange={onChange} />
          </div>
          {overlay}
        </div>
      </MilkdownProvider>
    );
  }
  return (
    <MilkdownProvider>
      <MarkdownToolbar />
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">
        <div
          data-zoom-wrapper
          className="relative"
          style={{
            width: contentWidth,
            minHeight: contentHeight,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* padding은 카드의 block-stack 텍스트 오프셋(약 9px,6px)과 맞춰 — 펜이
            * 카드에서 글자를 둘러쌌다면 모달에서도 같은 위치에 오도록. */}
          <div className="moss-md text-[13px]" style={{ padding: "6px 9px" }}>
            <MilkdownInner value={value} editable onChange={onChange} />
          </div>
          {overlay}
        </div>
      </div>
    </MilkdownProvider>
  );
}
