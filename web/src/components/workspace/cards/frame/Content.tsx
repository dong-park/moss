"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import type { Card } from "@/state/workspace";
import { decodeFrameConfig } from "@/state/frameContent";
import { ColumnsSkin } from "./skins/ColumnsSkin";

/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n7 — 메모판(frame) 렌더.
 * 메모보다 아래층(DraggableCard의 zIndex 분기)에 그려지는 이름 붙은 틀이다.
 * 빈 곳 드래그 = 이동, 모서리 = 리사이즈(둘 다 DraggableCard/ResizeHandles가
 * kind==="frame" 분기로 처리) — 이 컴포넌트는 이름표 렌더 + 인라인 이름 편집만 맡는다.
 * ───────────────────────────────────────────────────────────── */

export function FrameCardContent({ card }: { card: Card }) {
  const renameFrame = useWorkspace((s) => s.renameFrame);
  // 드래그 중에도 판은 다시 렌더된다 — content가 같으면 파싱·칸 배경을 다시 하지 않는다.
  const config = useMemo(() => decodeFrameConfig(card.content), [card.content]);
  const name = config.name;
  const selected = useWorkspace((s) => s.selectedIds.includes(card.id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const startEditing = () => {
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    renameFrame(card.id, draft);
  };

  return (
    <div
      className="relative h-full w-full"
      data-frame-line="true"
      style={{
        // 그룹 선: 1px 실선. 고르면 선택 파랑.
        border: "1px solid " + (selected ? "var(--color-accent-blue)" : "var(--color-border)"),
        borderRadius: 4,
      }}
    >
      {/* FEAT-frame-skins: 세로 칸 스킨의 경계·이름표 배경. 메모보다 아래층. */}
      {config.skin === "columns" && (
        <ColumnsSkin frameId={card.id} columns={config.columns} />
      )}
      <div
        role={editing ? undefined : "button"}
        tabIndex={editing ? undefined : -1}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing();
        }}
        onMouseDown={(e) => {
          // 이름표 위에서는 드래그(카드 이동)를 시작하지 않는다 — 더블클릭 진입 보장.
          e.stopPropagation();
        }}
        // n10 브라우저 결함8: 판 위쪽에 멤버 메모가 붙으면 이름표가 가려졌다 —
        // 판의 DraggableCard 루트가 z-index:1~2(스택 컨텍스트)라 이름표에 아무리
        // 높은 z-index를 줘도 그 컨텍스트 밖의 메모(z:10~40)를 못 넘어선다.
        // DraggableCard가 frame에는 z-index를 아예 안 주도록 바꿔(auto — 새
        // 컨텍스트를 안 만듦) 이름표의 z-index가 world-layer 레벨에서 메모와
        // 직접 비교되게 한다(15 > 미선택 메모 10).
        // 이름표는 판 바깥 왼쪽 위에 둔다 — DraggableCard가 frame은 overflow visible로 둔다.
        style={{
          zIndex: 15,
          top: -20,
          left: -1,
          color: selected ? "var(--color-accent-blue)" : undefined,
        }}
        className="absolute max-w-[80%] text-[12px] font-semibold leading-4 text-text-soft"
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            className="w-full min-w-[80px] bg-transparent outline-none"
          />
        ) : (
          <span className="block truncate">{name}</span>
        )}
      </div>
    </div>
  );
}
