"use client";

import type { ConnectionSide } from "@/state/db/schema";
import { useWorkspace, type Card } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import {
  SIDE_NORMALS,
  anchorPoint,
  isConnectableCard,
} from "./geometry";
import { beginConnectionDrag } from "./dragSession";

const SIDES: ConnectionSide[] = ["top", "right", "bottom", "left"];
const HANDLE_OFFSET = 8;
const HANDLE_HIT = 24;
const DOT = 10;

/** 연결점 4개 — hover 중인 카드 하나에만 렌더된다(ConnectionHandlesLayer가 고른다). */
export function ConnectionHandles({ card }: { card: Card }) {
  const t = useT();
  const draftTargetSide = useWorkspace((s) =>
    s.connectionDraft?.targetId === card.id ? s.connectionDraft.targetSide : null,
  );

  return (
    <>
      {SIDES.map((side) => {
        const anchor = anchorPoint(card, side);
        const n = SIDE_NORMALS[side];
        const cx = anchor.x + n.x * HANDLE_OFFSET;
        const cy = anchor.y + n.y * HANDLE_OFFSET;
        const emphasized = draftTargetSide === side;
        return (
          <div
            key={side}
            data-connection-handle={side}
            role="button"
            aria-label={t("workspace.connectors.handle.aria", { side })}
            className="absolute flex cursor-crosshair items-center justify-center"
            style={{
              left: cx - HANDLE_HIT / 2,
              top: cy - HANDLE_HIT / 2,
              width: HANDLE_HIT,
              height: HANDLE_HIT,
              pointerEvents: "auto",
            }}
            onMouseEnter={() => useWorkspace.getState().setHoveredCard(card.id)}
            onMouseLeave={() => useWorkspace.getState().setHoveredCard(null)}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.preventDefault();
              beginConnectionDrag(card, side, e.clientX, e.clientY);
            }}
          >
            <span
              aria-hidden="true"
              className="rounded-full border transition-transform"
              style={{
                width: DOT,
                height: DOT,
                background: emphasized
                  ? "var(--color-accent-blue)"
                  : "var(--color-bg)",
                borderColor: emphasized
                  ? "var(--color-accent-blue)"
                  : "var(--color-border-strong)",
                transform: emphasized ? "scale(1.4)" : undefined,
              }}
            />
          </div>
        );
      })}
    </>
  );
}

/**
 * hover 중이거나 연결 드래그의 source/target인 연결 가능 카드에만 연결점을 렌더한다.
 * 카드 DOM은 overflow:hidden이라 카드 안에서 8px 바깥으로 못 그린다 — 월드 좌표
 * 오버레이로 카드 위에 얹는다. 펜 모드·카드 드래그 중에는 숨긴다(AC-1).
 */
export function ConnectionHandlesLayer({ cards }: { cards: Card[] }) {
  const hoveredCardId = useWorkspace((s) => s.hoveredCardId);
  const draft = useWorkspace((s) => s.connectionDraft);
  const penMode = useWorkspace((s) => s.penMode);
  const dragging = useWorkspace((s) => s.draggingId !== null);

  if (penMode || dragging) return null;

  const ids = new Set<string>();
  if (hoveredCardId) ids.add(hoveredCardId);
  if (draft?.sourceId) ids.add(draft.sourceId);
  if (draft?.targetId) ids.add(draft.targetId);

  const shown = cards.filter((c) => ids.has(c.id) && isConnectableCard(c));
  if (shown.length === 0) return null;

  return (
    <div
      className="absolute left-0 top-0"
      style={{ zIndex: 50, pointerEvents: "none" }}
      data-connection-handles-layer="true"
    >
      {shown.map((c) => (
        <ConnectionHandles key={c.id} card={c} />
      ))}
    </div>
  );
}
