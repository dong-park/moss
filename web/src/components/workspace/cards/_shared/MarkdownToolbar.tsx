"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-expand — 펼치기 모달 상단의 서식 프리셋 툴바.
 *
 * MilkdownProvider 내부에서만 동작한다(useInstance가 같은 인스턴스를 잡아야 함).
 * 각 버튼은 Milkdown 커맨드를 호출해 현재 선택/블록에 마크다운 서식을 적용한다.
 * 체크리스트는 전용 커맨드가 없어 insert 매크로로 task-list 항목을 삽입한다.
 *
 * 포커스 보존: 버튼 onMouseDown에서 preventDefault — 클릭이 에디터 선택을
 * 빼앗지 않게 해 "선택 → 서식" 흐름을 보장한다.
 * ───────────────────────────────────────────────────────────── */

import { useInstance } from "@milkdown/react";
import { callCommand, insert } from "@milkdown/utils";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  insertHrCommand,
} from "@milkdown/preset-commonmark";
import { toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { useT } from "@/i18n/Provider";
import type { Translator } from "@/i18n";

type Action = (ctx: Parameters<ReturnType<typeof callCommand>>[0]) => void;

type Item =
  | { kind: "sep" }
  | { kind: "btn"; id: string; label: string; aria: string; action: Action };

function buildItems(t: Translator): Item[] {
  const a = (key: string) => t(`workspace.memoEditor.toolbar.${key}`);
  return [
    {
      kind: "btn",
      id: "bold",
      label: "B",
      aria: a("bold"),
      action: callCommand(toggleStrongCommand.key),
    },
    {
      kind: "btn",
      id: "italic",
      label: "I",
      aria: a("italic"),
      action: callCommand(toggleEmphasisCommand.key),
    },
    {
      kind: "btn",
      id: "strike",
      label: "S",
      aria: a("strike"),
      action: callCommand(toggleStrikethroughCommand.key),
    },
    { kind: "sep" },
    {
      kind: "btn",
      id: "h1",
      label: "H1",
      aria: a("h1"),
      action: callCommand(wrapInHeadingCommand.key, 1),
    },
    {
      kind: "btn",
      id: "h2",
      label: "H2",
      aria: a("h2"),
      action: callCommand(wrapInHeadingCommand.key, 2),
    },
    { kind: "sep" },
    {
      kind: "btn",
      id: "bullet",
      label: "•",
      aria: a("bulletList"),
      action: callCommand(wrapInBulletListCommand.key),
    },
    {
      kind: "btn",
      id: "ordered",
      label: "1.",
      aria: a("orderedList"),
      action: callCommand(wrapInOrderedListCommand.key),
    },
    {
      kind: "btn",
      id: "checklist",
      label: "☑",
      aria: a("checklist"),
      action: insert("- [ ] "),
    },
    { kind: "sep" },
    {
      kind: "btn",
      id: "quote",
      label: "❝",
      aria: a("quote"),
      action: callCommand(wrapInBlockquoteCommand.key),
    },
    {
      kind: "btn",
      id: "code",
      label: "`",
      aria: a("code"),
      action: callCommand(toggleInlineCodeCommand.key),
    },
    {
      kind: "btn",
      id: "codeBlock",
      label: "▤",
      aria: a("codeBlock"),
      action: callCommand(createCodeBlockCommand.key),
    },
    {
      kind: "btn",
      id: "hr",
      label: "─",
      aria: a("divider"),
      action: callCommand(insertHrCommand.key),
    },
  ];
}

export function MarkdownToolbar() {
  const t = useT();
  // useInstance: [loading, get]. loading 중에는 get()이 undefined를 반환.
  const [loading, getEditor] = useInstance();
  const items = buildItems(t);

  const run = (action: Action) => {
    if (loading) return;
    getEditor().action(action);
  };

  return (
    <div
      role="toolbar"
      aria-label={t("workspace.memoEditor.toolbar.label")}
      className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5"
    >
      {items.map((item, i) =>
        item.kind === "sep" ? (
          <span
            key={`sep-${i}`}
            aria-hidden
            className="mx-1 h-4 w-px bg-border"
          />
        ) : (
          <button
            key={item.id}
            type="button"
            aria-label={item.aria}
            title={item.aria}
            data-toolbar-btn={item.id}
            // 클릭이 에디터 선택을 빼앗지 않게 — preventDefault로 포커스 유지.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(item.action)}
            className="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded px-1.5 text-sm text-text-muted transition-colors hover:bg-panel hover:text-text"
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
