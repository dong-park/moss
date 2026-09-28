import type { PresenceParticipant } from "@/state/presence/types";

/**
 * FEAT-collab-auth n7 (AC-9) — 원격 선택 테두리.
 *
 * 시안 v3: 카드마다 참여자 색 1.5px 테두리, 라운드 4px. 잠금은 없고
 * 소유자 선택과 겹쳐도 그대로 그린다. 순수 컴포넌트 — participants만 받는다.
 */
export function RemoteSelection({
  participants,
}: {
  participants: PresenceParticipant[];
}) {
  const rects = participants.flatMap((p) =>
    (p.selection ?? []).map((sel) => ({
      clientId: p.clientId,
      color: p.user.color,
      sel,
    })),
  );
  if (rects.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--z-selection)]"
      aria-hidden="true"
    >
      {rects.map(({ clientId, color, sel }) => (
        <div
          key={`${clientId}:${sel.noteId}`}
          data-testid={`remote-selection-${clientId}-${sel.noteId}`}
          className="absolute rounded-[4px]"
          style={{
            left: sel.x,
            top: sel.y,
            width: sel.width,
            height: sel.height,
            transform: `rotate(${sel.rotation}deg)`,
            boxShadow: `0 0 0 1.5px ${color}`,
          }}
        />
      ))}
    </div>
  );
}
