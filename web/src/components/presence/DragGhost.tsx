import type { PresenceParticipant } from "@/state/presence/types";

/**
 * FEAT-collab-auth n7 (AC-7) — 끄는 메모 잔상.
 *
 * 시안 v3: 끌리는 카드는 rotate(-4deg)·scale(1.04), 참여자 색 1.5px 테두리와
 * 들어올림 그림자. Awareness의 dragging{x,y,rotation}만으로 그린다.
 *
 * 잔상 크기는 기본 메모(210x210, 시안 v3)를 쓴다 — Awareness dragging은
 * noteId·x·y·rotation만 싣기에 카드 실크기는 알 수 없다. 크기별 잔상을
 * 원하면 n7 본체가 이 상수를 카드 기하로 대체한다.
 */
export const DRAG_GHOST_SIZE = 210;

export function DragGhost({
  participants,
}: {
  participants: PresenceParticipant[];
}) {
  const dragging = participants.filter((p) => p.dragging);
  if (dragging.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--z-selection)]"
      aria-hidden="true"
    >
      {dragging.map((p) => {
        const d = p.dragging!;
        return (
          <div
            key={`${p.clientId}:${d.noteId}`}
            data-testid={`drag-ghost-${p.clientId}-${d.noteId}`}
            className="absolute rounded-[4px]"
            style={{
              left: d.x,
              top: d.y,
              width: DRAG_GHOST_SIZE,
              height: DRAG_GHOST_SIZE,
              background: "var(--color-card-base)",
              transform: `rotate(${d.rotation}deg) scale(1.04)`,
              boxShadow: `0 0 0 1.5px ${p.user.color}, 0 16px 30px rgba(0,0,0,.12)`,
            }}
          />
        );
      })}
    </div>
  );
}
