"use client";

import { useWorkspace } from "@/state/workspace";
import { connectorPath, connectorPathToPoint } from "./geometry";

/** FEAT-connectors: 연결 드래그 중 포인터를 따라가는 미리보기 곡선. */
export function ConnectorDraft() {
  const cards = useWorkspace((s) => s.cards);
  const draft = useWorkspace((s) => s.connectionDraft);
  if (!draft) return null;

  const source = cards.find((c) => c.id === draft.sourceId);
  if (!source) return null;

  const target = draft.targetId
    ? cards.find((c) => c.id === draft.targetId)
    : undefined;

  const d =
    target && draft.targetSide
      ? connectorPath(source, draft.sourceSide, target, draft.targetSide)
      : connectorPathToPoint(source, draft.sourceSide, draft.pointer);

  return (
    <path
      d={d}
      fill="none"
      stroke="var(--color-accent-blue)"
      strokeWidth={2}
      strokeDasharray="6 4"
      markerEnd="url(#connector-arrow-draft)"
      data-connector-draft="true"
    />
  );
}
