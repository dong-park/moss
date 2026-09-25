"use client";

import { useMemo, useRef, useState } from "react";
import { cardCenter, useWorkspace } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import { ConnectorDraft } from "./ConnectorDraft";
import { connectorPath, midpoint, nearestSide } from "./geometry";

const LABEL_MAX = 40;

/** FEAT-connectors: 연결선 SVG 레이어 — 카드 아래 z-index, 월드 좌표. */
export function ConnectorLayer() {
  const t = useT();
  const cards = useWorkspace((s) => s.cards);
  const connections = useWorkspace((s) => s.connections);
  const selectedConnectionId = useWorkspace((s) => s.selectedConnectionId);
  const selectConnection = useWorkspace((s) => s.selectConnection);
  const setConnectionLabel = useWorkspace((s) => s.setConnectionLabel);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState("");
  // Esc로 편집을 취소할 때, 언마운트 blur가 commitLabel을 불러 저장되는 걸 막는다.
  const cancelRef = useRef(false);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const commitLabel = (id: string) => {
    setConnectionLabel(id, labelValue);
    setEditingId(null);
  };

  return (
    <svg
      data-connector-layer="true"
      width={1}
      height={1}
      className="absolute left-0 top-0"
      style={{ overflow: "visible", zIndex: 5, pointerEvents: "none" }}
    >
      <defs>
        <marker
          id="connector-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-text-soft)" />
        </marker>
        <marker
          id="connector-arrow-sel"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-accent-blue)" />
        </marker>
        <marker
          id="connector-arrow-draft"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-accent-blue)" />
        </marker>
      </defs>

      {connections.map((c) => {
        const source = byId.get(c.sourceNoteId);
        const target = byId.get(c.targetNoteId);
        // 양 끝이 현재 보드 카드일 때만 그린다(가상화 밖 카드도 반대쪽이 화면 안이면 그린다).
        if (!source || !target) return null;
        const sourceSide =
          c.sourceSide ?? nearestSide(source, cardCenter(target));
        const targetSide =
          c.targetSide ?? nearestSide(target, cardCenter(source));
        const d = connectorPath(source, sourceSide, target, targetSide);
        const selected = c.id === selectedConnectionId;
        const m = midpoint(d);
        const editing = editingId === c.id;

        return (
          <g key={c.id} data-connection-id={c.id}>
            {/* 히트 영역 — 투명하지만 stroke 폭 12px로 클릭을 받는다(AC-5). */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                selectConnection(c.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                cancelRef.current = false;
                setLabelValue(c.label ?? "");
                setEditingId(c.id);
              }}
            />
            <path
              d={d}
              fill="none"
              stroke={selected ? "var(--color-accent-blue)" : "var(--color-text-soft)"}
              strokeWidth={selected ? 3 : 2}
              markerEnd={
                selected
                  ? "url(#connector-arrow-sel)"
                  : "url(#connector-arrow)"
              }
              style={{ pointerEvents: "none" }}
            />

            {editing ? (
              <foreignObject
                x={m.x - 70}
                y={m.y - 14}
                width={140}
                height={28}
                style={{ pointerEvents: "auto" }}
              >
                <input
                  autoFocus
                  value={labelValue}
                  placeholder={t("workspace.connectors.label.placeholder")}
                  onChange={(e) => setLabelValue(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitLabel(c.id);
                    else if (e.key === "Escape") {
                      cancelRef.current = true;
                      setEditingId(null);
                    }
                  }}
                  onBlur={() => {
                    if (cancelRef.current) {
                      cancelRef.current = false;
                      setEditingId(null);
                      return;
                    }
                    commitLabel(c.id);
                  }}
                  className="h-full w-full rounded-full border border-border bg-bg px-2 text-center text-xs text-text outline-none"
                />
              </foreignObject>
            ) : c.label ? (
              <text
                x={m.x}
                y={m.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fill="var(--color-text)"
                style={{
                  pointerEvents: "none",
                  paintOrder: "stroke",
                  stroke: "var(--color-bg)",
                  strokeWidth: 5,
                }}
              >
                {c.label.length > LABEL_MAX
                  ? `${c.label.slice(0, LABEL_MAX)}…`
                  : c.label}
              </text>
            ) : null}
          </g>
        );
      })}

      <ConnectorDraft />
    </svg>
  );
}
