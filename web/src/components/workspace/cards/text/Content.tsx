"use client";

import { useMemo, useRef } from "react";
import { useT } from "@/i18n/Provider";
import {
  makeBlock,
  parseBlocks,
  serializeBlocks,
  type CardBlock,
  type CardBlockType,
} from "@/state/cardContent";
import { cardSurface } from "../_shared/surface";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import { TextBlock } from "../_shared/blocks/TextBlock";
import { CodeBlock } from "../_shared/blocks/CodeBlock";
import { HandwritingBlock } from "../_shared/blocks/HandwritingBlock";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * 글(포스트잇) 카드 — 올인원 블록 스택 (FEAT-card-allinone).
 *
 * content는 CardBlock[]를 JSON 배열로 직렬화한다. text/code/handwriting
 * 블록을 위→아래로 쌓고, 편집 모드에서 추가(글/코드/손글씨)·삭제·이동(↑/↓).
 *
 * 진입 (FEAT-card-entry-mode §6): 첫 text(없으면 code) 블록에 자동 포커스.
 * 빈 카드(content="")는 빈 text 블록 1개로 보여 첫 키스트로크를 받는다.
 * ───────────────────────────────────────────────────────────── */

const ADD_TYPES: { type: CardBlockType; labelKey: string }[] = [
  { type: "text", labelKey: "capture.block.text" },
  { type: "code", labelKey: "capture.block.code" },
  { type: "handwriting", labelKey: "capture.block.handwriting" },
];

export function TextCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  // 빈 카드는 빈 text 블록 1개로 표현 (입력 시작점). 아직 직렬화엔 반영 안 함.
  const blocks: CardBlock[] = useMemo(() => {
    const parsed = parseBlocks(card.content);
    return parsed.length ? parsed : [{ type: "text", text: "" }];
  }, [card.content]);

  const commit = (next: CardBlock[]) => onChange(serializeBlocks(next));
  const updateBlock = (i: number, b: CardBlock) =>
    commit(blocks.map((x, j) => (j === i ? b : x)));
  const addBlock = (type: CardBlockType) => commit([...blocks, makeBlock(type)]);
  const deleteBlock = (i: number) => commit(blocks.filter((_, j) => j !== i));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  // 자동 포커스 타겟 = 첫 text 블록(없으면 첫 code 블록). 둘 다 없으면 포커스 안 함.
  const focusIndex = useMemo(() => {
    const txt = blocks.findIndex((b) => b.type === "text");
    if (txt !== -1) return txt;
    const code = blocks.findIndex((b) => b.type === "code");
    return code;
  }, [blocks]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useAutoFocusOnEdit(inputRef, editing && focusIndex !== -1);

  const stopDrag = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="relative h-full"
      style={{ minHeight: 80, borderRadius: 6, ...cardSurface("text") }}
      onKeyDown={(e) => {
        // textarea·손글씨 캔버스는 자체 Esc 처리 — 위임.
        if (e.target instanceof HTMLTextAreaElement) return;
        if ((e.target as HTMLElement).closest?.("[data-card-canvas]")) return;
        if (e.key === "Escape") {
          e.preventDefault();
          onCommitEdit();
        }
      }}
    >
      <div
        className="absolute flex flex-col gap-1.5 overflow-auto px-2 py-1.5"
        style={{ top: "1%", left: "1%", right: "3%", bottom: "4%" }}
      >
        {blocks.map((block, i) => (
          <div key={i} className="group/block relative flex items-start gap-1">
            <div className="min-w-0 flex-1">
              {block.type === "text" && (
                <TextBlock
                  text={block.text}
                  editing={editing}
                  onChange={(text) => updateBlock(i, { type: "text", text })}
                  onCommitEdit={onCommitEdit}
                  inputRef={i === focusIndex ? inputRef : undefined}
                  primary={i === focusIndex}
                />
              )}
              {block.type === "code" && (
                <CodeBlock
                  code={block.code}
                  lang={block.lang}
                  editing={editing}
                  onChange={(next) =>
                    updateBlock(i, { type: "code", code: next.code, lang: next.lang })
                  }
                  onCommitEdit={onCommitEdit}
                  inputRef={i === focusIndex ? inputRef : undefined}
                  primary={i === focusIndex}
                />
              )}
              {block.type === "handwriting" && (
                <HandwritingBlock
                  paths={block.paths}
                  editing={editing}
                  onChange={(paths) => updateBlock(i, { type: "handwriting", paths })}
                  onCommitEdit={onCommitEdit}
                />
              )}
            </div>

            {editing && (
              <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover/block:opacity-100">
                <button
                  type="button"
                  aria-label={t("capture.block.moveUp")}
                  disabled={i === 0}
                  onMouseDown={stopDrag}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(i, -1);
                  }}
                  className="text-[10px] leading-none text-text-soft hover:text-text disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={t("capture.block.moveDown")}
                  disabled={i === blocks.length - 1}
                  onMouseDown={stopDrag}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(i, 1);
                  }}
                  className="text-[10px] leading-none text-text-soft hover:text-text disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={t("capture.block.delete")}
                  onMouseDown={stopDrag}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteBlock(i);
                  }}
                  className="text-[10px] leading-none text-text-soft hover:text-text"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}

        {editing && (
          <div className="flex items-center gap-1 pt-0.5 text-[10px] text-text-soft">
            <span className="select-none">{t("capture.block.add")}</span>
            {ADD_TYPES.map(({ type, labelKey }) => (
              <button
                key={type}
                type="button"
                onMouseDown={stopDrag}
                onClick={(e) => {
                  e.stopPropagation();
                  addBlock(type);
                }}
                className="rounded border border-border px-1 leading-none hover:text-text hover:border-text-soft"
              >
                + {t(labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
