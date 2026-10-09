"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import { isFocusInSameCard } from "../_shared/memoTitleFocus";
import type { Card } from "@/state/workspace";
import type { TodoItem } from "./face";

/* ─────────────────────────────────────────────────────────────
 * 할 일 메모 앞면 (spec/card-faces.md) — 메모 창 없이 카드에서 바로 고친다.
 *
 * 평소: 항목 클릭은 완료·미완료 토글뿐이다. 나머지 자리는 카드 선택·드래그다.
 * 더블클릭(DraggableCard) → 편집: 제목·항목이 입력칸이 된다.
 *
 * 본문은 `- [ ] 글` 줄들이고, 고칠 때마다 줄 전체를 다시 쓴다.
 * - 제목 Enter → 첫 항목으로
 * - 항목 Enter → 아래에 새 항목
 * - 빈 항목 Backspace → 그 항목을 지우고 위로
 * - 상자 클릭 → 체크 토글
 * 카드 밖으로 포커스가 나가면 제목을 확정하고 편집을 끝낸다.
 * ───────────────────────────────────────────────────────────── */

type Props = {
  card: Card;
  items: TodoItem[];
  editing: boolean;
  onCommitEdit: () => void;
};

type Row = { text: string; done: boolean };

function serialize(rows: Row[]): string {
  return rows.map((r) => `- [${r.done ? "x" : " "}] ${r.text}`).join("\n");
}

export function TodoFace({ card, items, editing, onCommitEdit }: Props) {
  const t = useT();
  const setContent = useWorkspace((s) => s.setContent);
  const setTitle = useWorkspace((s) => s.setTitle);
  const commitTitle = useWorkspace((s) => s.commitTitle);

  const titleRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLInputElement | null)[]>([]);
  // 줄을 더하거나 지운 뒤 다음 렌더에서 포커스할 항목 index.
  const focusNext = useRef<number | null>(null);

  const rows: Row[] = items.map(({ text, done }) => ({ text, done }));
  const write = (next: Row[]) => setContent(card.id, serialize(next));
  const toggle = (i: number) => write(rows.map((r, j) => (j === i ? { ...r, done: !r.done } : r)));

  useEffect(() => {
    if (focusNext.current === null) return;
    itemRefs.current[focusNext.current]?.focus();
    focusNext.current = null;
  });

  // 도크에서 막 만든 카드처럼 편집으로 들어왔는데 카드 안에 포커스가 없으면 제목에 둔다.
  useEffect(() => {
    if (!editing) return;
    if (isFocusInSameCard(document.activeElement, card.id)) return;
    titleRef.current?.focus();
  }, [editing, card.id]);

  const onBlur = (e: React.FocusEvent) => {
    if (isFocusInSameCard(e.relatedTarget, card.id)) return;
    commitTitle(card.id);
    if (editing) onCommitEdit();
  };
  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return false;
    e.preventDefault();
    (e.target as HTMLElement).blur();
    return true;
  };

  return (
    <div className="moss-card-face" data-memo-face="todo">
      <div className="card face check">
        <input
          ref={titleRef}
          data-todo-input={editing ? true : undefined}
          className="title"
          value={card.title ?? ""}
          placeholder={t("workspace.todo.titlePlaceholder")}
          aria-label={t("workspace.todo.titlePlaceholder")}
          onChange={(e) => setTitle(card.id, e.target.value)}
          readOnly={!editing}
          tabIndex={editing ? 0 : -1}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (onEscape(e)) return;
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (rows.length === 0) write([{ text: "", done: false }]);
              focusNext.current = 0;
              itemRefs.current[0]?.focus();
            }
          }}
        />
        <ul className="m-0 list-none p-0">
          {rows.map((row, i) => (
            <li
              key={i}
              className={row.done ? "edit on" : "edit"}
              // 편집 전엔 줄 어디를 눌러도 토글 — 드래그도 시작하지 않는다.
              data-todo-input={editing ? undefined : true}
              onClick={editing ? undefined : () => toggle(i)}
            >
              <button
                type="button"
                data-todo-input
                className="box"
                aria-label={t("workspace.todo.toggle")}
                aria-pressed={row.done}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(i);
                }}
              />
              <input
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                data-todo-input={editing ? true : undefined}
                readOnly={!editing}
                tabIndex={editing ? 0 : -1}
                value={row.text}
                placeholder={t("workspace.todo.itemPlaceholder")}
                aria-label={t("workspace.todo.itemLabel")}
                onChange={(e) => write(rows.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))}
                onBlur={onBlur}
                onKeyDown={(e) => {
                  if (onEscape(e)) return;
                  if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter는 글자 확정이다.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    write([...rows.slice(0, i + 1), { text: "", done: false }, ...rows.slice(i + 1)]);
                    focusNext.current = i + 1;
                  } else if (e.key === "Backspace" && row.text === "" && rows.length > 1) {
                    e.preventDefault();
                    write(rows.filter((_, j) => j !== i));
                    focusNext.current = Math.max(0, i - 1);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
