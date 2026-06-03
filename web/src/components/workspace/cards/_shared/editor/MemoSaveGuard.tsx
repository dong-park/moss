"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-memo-autosave-guard (W1) — 유실 가드 단일 배선점.
 *
 * 카드 본문(text/Content.tsx)이 **한 줄**로 자동저장 가드를 켜는 진입점이다
 * ([[_squad-memo-production]] §조율점 — Content.tsx는 W1·W7·W9 공용이라 append-only).
 * 세 조각을 한곳에 모은다:
 *   1) useFlushOnExit(cardId)        — 언마운트/탭종료 flush 배선
 *   2) content 변경 감지 → reportChange — 타이핑을 "저장 중…"으로 (AC-3)
 *   3) <SaveIndicator/>              — 저장 상태 표시
 *
 * 변경 감지는 editing 중에만 보고한다 — 보드 전환/마이그레이션 표시 같은 외부
 * content 갱신을 "저장 중"으로 오인하지 않게. 최초 마운트 값은 기준선으로만 잡고
 * 보고하지 않는다.
 * ───────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { useFlushOnExit } from "./useFlushOnExit";
import { reportChange } from "./saveState";
import { SaveIndicator } from "./SaveIndicator";

export function MemoSaveGuard({
  cardId,
  content,
  editing,
}: {
  cardId: string;
  content: string;
  editing: boolean;
}) {
  useFlushOnExit(cardId);

  const prevContent = useRef(content);
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      prevContent.current = content;
      return;
    }
    if (content === prevContent.current) return;
    prevContent.current = content;
    if (editing) reportChange(cardId);
  }, [cardId, content, editing]);

  return <SaveIndicator cardId={cardId} />;
}
