import type { PresenceParticipant } from "@/state/presence/types";

/**
 * FEAT-collab-auth n7 (AC-7) — 원격 커서 + 이름표.
 *
 * 시안 v3: 화살표 16x18, 이름표는 커서에서 left 12 / top 14에 붙고
 * 10px·흰 글자·참여자 색 배경. provider·스토어를 모르는 순수 컴포넌트라
 * `participants` 배열 하나만 받는다.
 */
export function RemoteCursors({
  participants,
}: {
  participants: PresenceParticipant[];
}) {
  const withCursor = participants.filter((p) => p.cursor);
  if (withCursor.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--z-selection)]"
      aria-hidden="true"
    >
      {withCursor.map((p) => {
        const color = p.user.color;
        return (
          <div
            key={p.clientId}
            data-testid={`remote-cursor-${p.clientId}`}
            className="absolute"
            style={{ left: p.cursor!.x, top: p.cursor!.y }}
          >
            <svg width="16" height="18" aria-hidden="true">
              <path
                d="M1 1 L1 16 L5 12 L8 17 L10.5 16 L7.5 11 L13 11 Z"
                fill={color}
                stroke="#fff"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              data-testid={`remote-name-${p.clientId}`}
              className="absolute whitespace-nowrap rounded-full px-1.5 text-[10px] font-medium leading-4 text-white"
              style={{ left: 12, top: 14, background: color }}
            >
              {p.user.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
