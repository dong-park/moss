"use client";

import { BoardCardContent } from "./board/Content";
import { FrameCardContent } from "./frame/Content";
import { TextCardContent } from "./text/Content";
import type { CardContentProps } from "./_shared/types";

/**
 * 카드 종류별 컨텐츠 컴포넌트 라우터.
 * 실제 렌더링·상호작용 로직은 각 {kind}/Content.tsx에 분리되어 있다.
 * 새 kind 도입 시: (1) {kind}/Content.tsx 추가 → (2) 여기서 import + case 추가.
 */
export function CardContent({
  card,
  editing,
  onChange,
  onCommitEdit,
}: CardContentProps) {
  switch (card.kind) {
    // FEAT-subcanvas: 함 카드. 더블클릭 진입은 DraggableCard가 처리.
    case "board":
      return <BoardCardContent card={card} />;
    // FEAT-sticky-redesign: 메모판. 이름 더블클릭 편집은 FrameCardContent 자체가 처리.
    case "frame":
      return <FrameCardContent card={card} />;
    // FEAT-sticky-redesign n10: 메모는 한 종류(text) — image/link/audio/file/mindmap/
    // handwriting/code/checklist/highlight 전용 화면은 삭제했다. 레거시 행(가져오기 등으로
    // 유입될 경우)은 decodeNoteToCard가 code/handwriting은 text 블록으로, 나머지는
    // migratedContent가 처리 가능한 것만 text로 환원한다. 그 외(image/link/audio/file/
    // mindmap)는 kind가 그대로 남을 수 있어 여기 default(text)로 떨어져 raw content를
    // 텍스트로 보여준다 — 크래시 대신 열화 렌더(spec §6 "기존 종류 값은 타입에 남긴다").
    case "text":
    default:
      return (
        <TextCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
  }
}
