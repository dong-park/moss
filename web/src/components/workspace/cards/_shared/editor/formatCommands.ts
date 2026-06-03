/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-incard-format (W3) — 인카드 서식 커맨드 맵(공유 추출).
 *
 * 모달 툴바(MarkdownToolbar)와 인카드 버블 툴바가 같은 서식 의미·같은 i18n
 * 키(workspace.memoEditor.toolbar.*)·같은 라벨을 쓰도록 한 곳에 모은다(스펙 §2·AC-5).
 *
 * 실행 컨텍스트가 다르다:
 *  - 모달 툴바는 Milkdown ctx 위에서 callCommand로 동작한다.
 *  - 버블 항목(BubbleMenuItem.run/isActive)은 ProseMirror `EditorView`만 받는다
 *    (P0가 확정한 시그니처 — [[_squad-memo-production]] §인터페이스).
 * 따라서 여기 커맨드는 view.state.schema에서 마크/노드 타입을 직접 찾아 ProseMirror
 * 원시 커맨드(toggleMark/setBlockType/wrapIn/wrapInList)로 적용한다. 스키마 id는
 * commonmark/gfm 프리셋 실측값(strong/emphasis/inlineCode/strike_through, heading·
 * bullet_list·ordered_list·list_item·blockquote)을 사용한다.
 *
 * aria는 모듈 로드 시점의 ko 번역기(@/i18n의 모듈 레벨 `t`)로 해석한다 — 호스트
 * (BubbleMenuHost)가 React 훅(useT) 밖에서 item.aria를 그대로 렌더하기 때문.
 * 현재 Locale은 "ko" 단일이라 안전하며, 키 재사용으로 AC-5(i18n 키 동일)를 만족한다.
 * ───────────────────────────────────────────────────────────── */

import { toggleMark, setBlockType, wrapIn } from "@milkdown/prose/commands";
import { wrapInList, liftListItem } from "@milkdown/prose/schema-list";
import type { MarkType, Node as ProseNode } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";

import { t } from "@/i18n";

export type FormatCommand = {
  label: string;
  aria: string;
  run: (view: EditorView) => void;
  isActive: (view: EditorView) => boolean;
};

const tb = (key: string) => t(`workspace.memoEditor.toolbar.${key}`);

/* ── 활성 판별 헬퍼 ──────────────────────────────────────────── */

function markActive(view: EditorView, type: MarkType): boolean {
  const { state } = view;
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks ?? $from.marks());
  }
  return state.doc.rangeHasMark(from, to, type);
}

// 선택의 조상 블록 중 술어를 만족하는 노드가 있는지(가장 가까운 곳부터).
function ancestor(
  view: EditorView,
  pred: (node: ProseNode) => boolean,
): boolean {
  const { $from } = view.state.selection;
  for (let d = $from.depth; d >= 0; d -= 1) {
    if (pred($from.node(d))) return true;
  }
  return false;
}

/* ── 커맨드 빌더 ─────────────────────────────────────────────── */

function markCmd(name: string): Pick<FormatCommand, "run" | "isActive"> {
  return {
    run: (view) => {
      const type = view.state.schema.marks[name];
      if (!type) return;
      toggleMark(type)(view.state, view.dispatch);
      view.focus();
    },
    isActive: (view) => {
      const type = view.state.schema.marks[name];
      return type ? markActive(view, type) : false;
    },
  };
}

function isHeading(view: EditorView, level: number): boolean {
  return ancestor(
    view,
    (n) => n.type.name === "heading" && n.attrs.level === level,
  );
}

function headingCmd(level: number): Pick<FormatCommand, "run" | "isActive"> {
  return {
    run: (view) => {
      const { state, dispatch } = view;
      const heading = state.schema.nodes.heading;
      const paragraph = state.schema.nodes.paragraph;
      if (!heading || !paragraph) return;
      // 이미 같은 레벨이면 문단으로 토글(모달 wrapInHeading과 동일 의미).
      const cmd = isHeading(view, level)
        ? setBlockType(paragraph)
        : setBlockType(heading, { level });
      cmd(state, dispatch);
      view.focus();
    },
    isActive: (view) => isHeading(view, level),
  };
}

function listCmd(name: string): Pick<FormatCommand, "run" | "isActive"> {
  return {
    run: (view) => {
      const type = view.state.schema.nodes[name];
      if (!type) return;
      wrapInList(type)(view.state, view.dispatch);
      view.focus();
    },
    isActive: (view) => ancestor(view, (n) => n.type.name === name),
  };
}

// gfm는 list_item에 checked 속성을 둔다(null=일반 항목, false/true=체크박스).
function isChecklist(view: EditorView): boolean {
  return ancestor(
    view,
    (n) => n.type.name === "list_item" && n.attrs.checked != null,
  );
}

const checklistCmd: Pick<FormatCommand, "run" | "isActive"> = {
  run: (view) => {
    const { state, dispatch } = view;
    const bulletList = state.schema.nodes.bullet_list;
    const listItem = state.schema.nodes.list_item;
    if (!bulletList || !listItem) return;
    // 이미 체크리스트면 토글 해제(목록 밖으로 들어올림).
    if (isChecklist(view)) {
      liftListItem(listItem)(state, dispatch);
      view.focus();
      return;
    }
    // 그 외엔 글머리 목록으로 감싼 뒤 새 항목을 task(checked=false)로 표시.
    wrapInList(bulletList)(state, (tr) => {
      const { from, to } = tr.selection;
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === listItem) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
        }
      });
      dispatch(tr);
    });
    view.focus();
  },
  isActive: (view) => isChecklist(view),
};

const blockquoteCmd: Pick<FormatCommand, "run" | "isActive"> = {
  run: (view) => {
    const type = view.state.schema.nodes.blockquote;
    if (!type) return;
    wrapIn(type)(view.state, view.dispatch);
    view.focus();
  },
  isActive: (view) => ancestor(view, (n) => n.type.name === "blockquote"),
};

/* ── 공유 커맨드 맵 ──────────────────────────────────────────── */

export const FORMAT_COMMANDS: Record<string, FormatCommand> = {
  bold: { label: "B", aria: tb("bold"), ...markCmd("strong") },
  italic: { label: "I", aria: tb("italic"), ...markCmd("emphasis") },
  strike: { label: "S", aria: tb("strike"), ...markCmd("strike_through") },
  h1: { label: "H1", aria: tb("h1"), ...headingCmd(1) },
  h2: { label: "H2", aria: tb("h2"), ...headingCmd(2) },
  bullet: { label: "•", aria: tb("bulletList"), ...listCmd("bullet_list") },
  ordered: { label: "1.", aria: tb("orderedList"), ...listCmd("ordered_list") },
  checklist: { label: "☑", aria: tb("checklist"), ...checklistCmd },
  quote: { label: "❝", aria: tb("quote"), ...blockquoteCmd },
  code: { label: "`", aria: tb("code"), ...markCmd("inlineCode") },
};
