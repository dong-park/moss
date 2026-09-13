"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import type { Card } from "@/state/workspace";
import { decodeFrameContent } from "@/state/frameContent";

/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n7 — 메모판(frame) 렌더.
 * 메모보다 아래층(DraggableCard의 zIndex 분기)에 그려지는 이름 붙은 틀이다.
 * 빈 곳 드래그 = 이동, 모서리 = 리사이즈(둘 다 DraggableCard/ResizeHandles가
 * kind==="frame" 분기로 처리) — 이 컴포넌트는 이름표 렌더 + 인라인 이름 편집만 맡는다.
 * ───────────────────────────────────────────────────────────── */

export function FrameCardContent({ card }: { card: Card }) {
  const renameFrame = useWorkspace((s) => s.renameFrame);
  const name = decodeFrameContent(card.content);
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
      className="relative h-full w-full rounded-[12px]"
      style={{
        border: "2px dashed var(--color-accent-lime)",
        background: "rgba(154, 205, 50, 0.06)",
      }}
    >
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
        style={{ zIndex: 15 }}
        className="absolute -top-3 left-3 max-w-[80%] rounded-md bg-bg px-2 py-0.5 text-[12px] font-semibold text-text shadow-card"
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
