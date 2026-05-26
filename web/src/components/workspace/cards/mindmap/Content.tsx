"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/Provider";
import {
  makeMindmapNodeId,
  parseMindmap,
  serializeMindmap,
  type MindmapNode,
} from "@/state/cardContent";
import { cardSurface } from "../_shared/surface";
import { EditableLine } from "../_shared/editable";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Mindmap — 재귀 트리. Tab으로 깊이 +1, Shift+Tab으로 깊이 -1,
 * ↑/↓는 in-order 순회로 인접 노드 포커스. checklist 키보드 패턴 + 트리 확장.
 * ───────────────────────────────────────────────────────────── */

/** in-order로 평탄화한 행 정보. depth는 root 자식들을 0으로 두고 자식이 깊어질수록 +1. */
type FlatNode = { node: MindmapNode; depth: number };

/** root 자식들을 in-order 순회로 평탄화. (root 자신은 별도 헤더로 렌더되므로 제외) */
function flatten(children: MindmapNode[], depth = 0, out: FlatNode[] = []): FlatNode[] {
  for (const c of children) {
    out.push({ node: c, depth });
    if (c.children.length > 0) flatten(c.children, depth + 1, out);
  }
  return out;
}

/** id로 부모/자식배열/index를 찾아 반환. 못 찾으면 null. */
function findParent(
  children: MindmapNode[],
  id: string,
  parent: MindmapNode[] = children,
): { siblings: MindmapNode[]; index: number } | null {
  for (let i = 0; i < parent.length; i++) {
    if (parent[i].id === id) return { siblings: parent, index: i };
    const inChild = findParent(children, id, parent[i].children);
    if (inChild) return inChild;
  }
  return null;
}

/** children 트리를 깊은 복제. 트리 mutation 도우미 전에 호출. */
function cloneTree(nodes: MindmapNode[]): MindmapNode[] {
  return nodes.map((n) => ({ ...n, children: cloneTree(n.children) }));
}

/** afterId 노드 바로 뒤에 같은 깊이로 새 노드 삽입. 새 노드 id 반환. */
function insertSiblingAfter(
  children: MindmapNode[],
  afterId: string,
  newNode: MindmapNode,
): { next: MindmapNode[]; insertedId: string } | null {
  const cloned = cloneTree(children);
  const found = findParent(cloned, afterId);
  if (!found) return null;
  found.siblings.splice(found.index + 1, 0, newNode);
  return { next: cloned, insertedId: newNode.id };
}

/** id 노드를 트리에서 제거. */
function removeNode(
  children: MindmapNode[],
  id: string,
): { next: MindmapNode[] } | null {
  const cloned = cloneTree(children);
  const found = findParent(cloned, id);
  if (!found) return null;
  found.siblings.splice(found.index, 1);
  return { next: cloned };
}

/**
 * 들여쓰기 — id 노드를 자기 이전 형제의 마지막 자식으로 이동. depth +1.
 * 이전 형제가 없으면 no-op (이미 첫 번째라 들여쓸 곳 없음).
 */
function indentNode(
  children: MindmapNode[],
  id: string,
): { next: MindmapNode[] } | null {
  const cloned = cloneTree(children);
  const found = findParent(cloned, id);
  if (!found) return null;
  if (found.index === 0) return null;
  const [moved] = found.siblings.splice(found.index, 1);
  const prevSibling = found.siblings[found.index - 1];
  prevSibling.children.push(moved);
  return { next: cloned };
}

/**
 * 내어쓰기 — id 노드를 부모의 다음 형제 위치로 이동. depth -1.
 * 부모가 root 직속(depth 0)이면 더 위로 못 가므로 no-op.
 * 구현: (grandparent.children, parent, parentIndexInGrand, childIndexInParent)를 찾는다.
 */
function outdentNode(
  children: MindmapNode[],
  id: string,
): { next: MindmapNode[] } | null {
  const cloned = cloneTree(children);

  // walk: 현재 노드 배열 안에서 id를 가진 노드의 부모 정보를 찾는다.
  // grandSiblings는 "부모가 들어있는 배열". 부모가 cloned(=root.children) 자신일 수도 있다.
  function walk(
    siblings: MindmapNode[],
    parent: MindmapNode | null,
    parentSiblings: MindmapNode[] | null,
  ): {
    grandSiblings: MindmapNode[];
    parentIndex: number;
    parent: MindmapNode;
    childIndex: number;
  } | null {
    for (let i = 0; i < siblings.length; i++) {
      const n = siblings[i];
      const childIdx = n.children.findIndex((c) => c.id === id);
      if (childIdx !== -1) {
        // n이 부모. n이 들어있는 배열을 grandSiblings로 써야 그 다음 위치에 끼울 수 있다.
        // 단, n이 root.children(depth 0 시작)이면 부모는 root 자체 → 내어쓸 곳 없음.
        if (parentSiblings === null) return null; // n이 root.children에 직접 들어있음 → child는 depth 1, outdent하면 depth 0 가능
        return {
          grandSiblings: parentSiblings,
          parentIndex: parentSiblings.indexOf(n),
          parent: n,
          childIndex: childIdx,
        };
      }
      const deeper = walk(n.children, n, siblings);
      if (deeper) return deeper;
    }
    return null;
  }

  // cloned가 root.children. parentSiblings=null로 시작 → cloned 안에서 자식이 발견되면 depth 0인 노드라 outdent 불가.
  // walk가 cloned의 각 노드 n으로 들어가면 n.children에서 id를 찾을 때 parentSiblings=cloned가 된다 → depth 1을 depth 0으로 끌어올림.
  const found = walk(cloned, null, null);
  if (!found) return null;
  const [moved] = found.parent.children.splice(found.childIndex, 1);
  found.grandSiblings.splice(found.parentIndex + 1, 0, moved);
  return { next: cloned };
}

/** id 노드를 트리에서 찾아 patch 적용한 새 children 반환. */
function patchNode(
  children: MindmapNode[],
  id: string,
  patch: Partial<MindmapNode>,
): MindmapNode[] {
  return children.map((c) => {
    if (c.id === id) return { ...c, ...patch };
    return { ...c, children: patchNode(c.children, id, patch) };
  });
}

export function MindmapCardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const data = useMemo(() => parseMindmap(card.content), [card.content]);
  const root = data.root;
  const flat = useMemo(() => flatten(root.children), [root.children]);

  // 키보드 내비게이션 동안 어떤 노드 input에 포커스를 둘지 추적. checklist와 동일 패턴.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const writeChildren = (next: MindmapNode[]) =>
    onChange(serializeMindmap({ root: { ...root, children: next } }));

  /** 같은 깊이의 다음 위치에 새 노드 추가 + 포커스. afterId=null이면 root 자식 끝. */
  const addSiblingAfter = (afterId: string | null) => {
    const newNode: MindmapNode = {
      id: makeMindmapNodeId(),
      text: "",
      children: [],
    };
    if (afterId == null) {
      writeChildren([...root.children, newNode]);
    } else {
      const result = insertSiblingAfter(root.children, afterId, newNode);
      if (!result) return;
      writeChildren(result.next);
    }
    setFocusedId(newNode.id);
  };

  const updateNode = (id: string, patch: Partial<MindmapNode>) => {
    writeChildren(patchNode(root.children, id, patch));
  };

  /** 노드 제거 후 in-order에서 이전 노드(없으면 null) 끝으로 포커스. */
  const removeAndFocusPrev = (id: string) => {
    const idx = flat.findIndex((f) => f.node.id === id);
    if (idx === -1) return;
    const result = removeNode(root.children, id);
    if (!result) return;
    writeChildren(result.next);
    const prev = flat[idx - 1];
    setFocusedId(prev ? prev.node.id : null);
  };

  /** in-order 평탄화 위에서 ±1 이동. */
  const focusSibling = (id: string, delta: -1 | 1) => {
    const idx = flat.findIndex((f) => f.node.id === id);
    const target = flat[idx + delta];
    if (target) setFocusedId(target.node.id);
  };

  const indent = (id: string) => {
    const result = indentNode(root.children, id);
    if (!result) return;
    writeChildren(result.next);
    setFocusedId(id); // 이동 후에도 같은 노드에 포커스 유지
  };

  const outdent = (id: string) => {
    const result = outdentNode(root.children, id);
    if (!result) return;
    writeChildren(result.next);
    setFocusedId(id);
  };

  return (
    <div
      className="relative h-full"
      style={{
        minHeight: 140,
        borderRadius: 6,
        ...cardSurface("mindmap"),
      }}
    >
      {/*
       * 콘텐츠를 mindmap PNG(코르크/크림 보드)의 종이 영역에 비율로 정렬.
       * spec §6 P1-E 측정값: top 8% (상단 압정 회피 보수값), left 4%, right 5%, bottom 10% (와이어 회피).
       */}
      <div
        className="absolute overflow-auto"
        style={{ top: "8%", left: "4%", right: "5%", bottom: "10%" }}
      >
        {/*
         * FEAT-card-entry-mode §6: mindmap 자동 포커스 타겟 = [data-card-node="root"] input.
         * 루트 EditableLine을 wrapper로 감싸 selector를 안정화. EditableLine 자체가
         * editing 진입 시 input focus를 수행하므로 헬퍼는 추가하지 않는다.
         */}
        <div data-card-node="root">
          <EditableLine
            value={root.text}
            editing={editing}
            placeholder={t("capture.mindmap.rootPlaceholder")}
            onChange={(text) => onChange(serializeMindmap({ root: { ...root, text } }))}
            onCommit={onCommitEdit}
            className="text-[13px] font-semibold text-text"
          />
        </div>

        <ul className="mt-2.5 space-y-1 pl-3 border-l border-border">
          {flat.map(({ node, depth }, idx) => (
            <MindmapNodeRow
              key={node.id}
              node={node}
              depth={depth}
              focused={
                focusedId === node.id ||
                (focusedId === null &&
                  editing &&
                  idx === flat.length - 1 &&
                  !node.text)
              }
              onFocused={() => setFocusedId(node.id)}
              onText={(text) => updateNode(node.id, { text })}
              onEnter={() => addSiblingAfter(node.id)}
              onRemove={() => removeAndFocusPrev(node.id)}
              onPrev={() => focusSibling(node.id, -1)}
              onNext={() => focusSibling(node.id, 1)}
              onIndent={() => indent(node.id)}
              onOutdent={() => outdent(node.id)}
              onCommit={onCommitEdit}
            />
          ))}
        </ul>

        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            addSiblingAfter(null);
          }}
          className="mt-2 cursor-pointer text-[12px] text-text-soft hover:text-text"
        >
          + {t("capture.mindmap.addChild")}
        </button>
      </div>
    </div>
  );
}

function MindmapNodeRow({
  node,
  depth,
  focused,
  onFocused,
  onText,
  onEnter,
  onRemove,
  onPrev,
  onNext,
  onIndent,
  onOutdent,
  onCommit,
}: {
  node: MindmapNode;
  depth: number;
  focused: boolean;
  onFocused: () => void;
  onText: (v: string) => void;
  onEnter: () => void;
  onRemove: () => void;
  onPrev: () => void;
  onNext: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onCommit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focused) return;
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [focused]);

  return (
    <li
      className="flex items-center gap-2"
      style={{ paddingLeft: depth * 14 }}
    >
      <span className="text-text-soft text-[10px]" aria-hidden>
        •
      </span>
      <input
        ref={inputRef}
        type="text"
        value={node.text}
        onChange={(e) => onText(e.target.value)}
        onFocus={onFocused}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "Tab") {
            // Tab: 들여쓰기 (depth +1), Shift+Tab: 내어쓰기 (depth -1).
            // 표준 아웃라인 에디터 동작 — 캔버스 포커스 이동과 충돌 회피 위해 preventDefault.
            e.preventDefault();
            if (e.shiftKey) onOutdent();
            else onIndent();
          } else if (
            e.key === "Backspace" &&
            node.text === "" &&
            !e.metaKey &&
            !e.ctrlKey
          ) {
            e.preventDefault();
            onRemove();
          } else if (e.key === "Escape") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onPrev();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onNext();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-text-soft text-text"
        placeholder="…"
      />
    </li>
  );
}
