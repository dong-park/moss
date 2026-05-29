"use client";

import { AudioCardContent } from "./audio/Content";
import { BoardCardContent } from "./board/Content";
import { CommentCardContent } from "./comment/Content";
import { FileCardContent } from "./file/Content";
import { HandwritingCardContent } from "./handwriting/Content";
import { ImageCardContent } from "./image/Content";
import { LinkCardContent } from "./link/Content";
import { MindmapCardContent } from "./mindmap/Content";
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
    case "comment":
      return <CommentCardContent card={card} />;
    // FEAT-subcanvas: 함 카드. 더블클릭 진입은 DraggableCard가 처리.
    case "board":
      return <BoardCardContent card={card} />;
    // code/checklist/highlight는 FEAT-markdown-memo-pen에서 마크다운 메모(text)로
    // 통합·마이그레이션됐다. 레거시 행은 decodeNoteToCard가 text로 환원하므로
    // 여기 도달하지 않고 default(text)로 떨어진다.
    case "image":
      return (
        <ImageCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
    case "file":
      return (
        <FileCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
    case "audio":
      return (
        <AudioCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
    case "handwriting":
      return (
        <HandwritingCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
    case "mindmap":
      return (
        <MindmapCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
    case "link":
      return (
        <LinkCardContent
          card={card}
          editing={editing}
          onChange={onChange}
          onCommitEdit={onCommitEdit}
        />
      );
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
