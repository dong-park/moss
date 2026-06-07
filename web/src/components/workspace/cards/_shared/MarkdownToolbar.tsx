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
import { useRef, type ChangeEvent } from "react";
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
  toggleLinkCommand,
  insertImageCommand,
} from "@milkdown/preset-commonmark";
import { toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { useT } from "@/i18n/Provider";
import type { Translator } from "@/i18n";
import { putBlob, makeAttachmentFilename } from "@/state/db/opfs";
import { useToasts } from "@/state/notifications";

/** 이미지 삽입 가드 — imagePaste와 동일 기준(10MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
    { kind: "sep" },
    {
      kind: "btn",
      id: "link",
      label: "🔗",
      aria: a("link"),
      // 선택 텍스트를 링크로. URL은 prompt로 받는다(빈 입력이면 취소).
      action: (ctx) => {
        const url = window.prompt(a("linkPrompt"));
        if (url && url.trim()) callCommand(toggleLinkCommand.key, { href: url.trim() })(ctx);
      },
    },
  ];
}

export function MarkdownToolbar() {
  const t = useT();
  // useInstance: [loading, get]. loading 중에는 get()이 undefined를 반환.
  const [loading, getEditor] = useInstance();
  const push = useToasts((s) => s.push);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const items = buildItems(t);

  const run = (action: Action) => {
    if (loading) return;
    getEditor().action(action);
  };

  const btnClass =
    "flex h-7 min-w-7 cursor-pointer items-center justify-center rounded px-1.5 text-sm text-text-muted transition-colors hover:bg-panel hover:text-text";

  // 이미지 버튼: 파일 선택 → OPFS 저장 → opfs:// image 노드 삽입(imagePaste와 동일 경로).
  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file || loading) return;
    if (!file.type.startsWith("image/")) {
      push({ tone: "warn", title: `지원하지 않는 이미지 형식이에요: ${file.type || "알 수 없음"}` });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      push({ tone: "warn", title: `이미지가 너무 커요 (최대 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB).` });
      return;
    }
    try {
      const ref = await putBlob(makeAttachmentFilename(file.type), file); // opfs:<id>
      const src = ref.replace(/^opfs:/, "opfs://"); // 마크다운 URL 스킴
      getEditor().action(callCommand(insertImageCommand.key, { src, alt: file.name }));
    } catch {
      push({ tone: "warn", title: "이미지를 저장하지 못했어요." });
    }
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
            className={btnClass}
          >
            {item.label}
          </button>
        ),
      )}
      {/* 이미지 삽입: 숨은 파일 입력 + 버튼 */}
      <button
        type="button"
        aria-label={t("workspace.memoEditor.toolbar.image")}
        title={t("workspace.memoEditor.toolbar.image")}
        data-toolbar-btn="image"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className={btnClass}
      >
        🖼
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickImage}
      />
    </div>
  );
}
