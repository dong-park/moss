"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Connection } from "@/state/db/schema";
import { cardCenter, useWorkspace, type Card } from "@/state/workspace";
import { useT } from "@/i18n/Provider";
import { ConnectorDraft } from "./ConnectorDraft";
import {
  bezierMidpoint,
  connectorGeometry,
  geometryPath,
  nearestSide,
} from "./geometry";

const LABEL_MAX = 40;

interface ConnectionItemProps {
  connection: Connection;
  source: Card;
  target: Card;
  selected: boolean;
  editing: boolean;
  labelValue: string;
  placeholder: string;
  onSelect: (id: string) => void;
  onStartEdit: (id: string, label: string | undefined) => void;
  onCancel: () => void;
  onCommit: (id: string, value: string) => void;
  onBlur: (id: string, value: string) => void;
  onLabelChange: (value: string) => void;
}

/**
 * FEAT-connectors: 선 하나. React.memo로 감싸 양 끝 카드 객체가 그대로면 다시 그리지
 * 않는다 — 카드 하나를 드래그할 때 그 카드에 닿은 선만 재렌더된다(spec §8).
 */
const ConnectionItem = memo(function ConnectionItem({
  connection,
  source,
  target,
  selected,
  editing,
  labelValue,
  placeholder,
  onSelect,
  onStartEdit,
  onCancel,
  onCommit,
  onBlur,
  onLabelChange,
}: ConnectionItemProps) {
  const sourceSide =
    connection.sourceSide ?? nearestSide(source, cardCenter(target));
  const targetSide =
    connection.targetSide ?? nearestSide(target, cardCenter(source));
  const geo = connectorGeometry(source, sourceSide, target, targetSide);
  const d = geometryPath(geo);
  const m = bezierMidpoint(geo.p0, geo.c1, geo.c2, geo.p1);

  return (
    <g data-connection-id={connection.id}>
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
          onSelect(connection.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEdit(connection.id, connection.label);
        }}
      />
      <path
        d={d}
        fill="none"
        stroke={selected ? "var(--color-accent-blue)" : "var(--color-text-soft)"}
        strokeWidth={selected ? 3 : 2}
        markerEnd={
          selected ? "url(#connector-arrow-sel)" : "url(#connector-arrow)"
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
            placeholder={placeholder}
            onChange={(e) => onLabelChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onCommit(connection.id, labelValue);
              else if (e.key === "Escape") onCancel();
            }}
            onBlur={() => onBlur(connection.id, labelValue)}
            className="h-full w-full rounded-full border border-border bg-bg px-2 text-center text-xs text-text outline-none"
          />
        </foreignObject>
      ) : connection.label ? (
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
          {connection.label.length > LABEL_MAX
            ? `${connection.label.slice(0, LABEL_MAX)}…`
            : connection.label}
        </text>
      ) : null}
    </g>
  );
});

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
  const placeholder = t("workspace.connectors.label.placeholder");

  const handleSelect = useCallback(
    (id: string) => selectConnection(id),
    [selectConnection],
  );
  const handleStartEdit = useCallback((id: string, label: string | undefined) => {
    cancelRef.current = false;
    setLabelValue(label ?? "");
    setEditingId(id);
  }, []);
  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setEditingId(null);
  }, []);
  const handleCommit = useCallback(
    (id: string, value: string) => {
      setConnectionLabel(id, value);
      setEditingId(null);
    },
    [setConnectionLabel],
  );
  const handleBlur = useCallback(
    (id: string, value: string) => {
      if (cancelRef.current) {
        cancelRef.current = false;
        setEditingId(null);
        return;
      }
      setConnectionLabel(id, value);
      setEditingId(null);
    },
    [setConnectionLabel],
  );
  const handleLabelChange = useCallback((value: string) => setLabelValue(value), []);

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
        const editing = editingId === c.id;

        return (
          <ConnectionItem
            key={c.id}
            connection={c}
            source={source}
            target={target}
            selected={c.id === selectedConnectionId}
            editing={editing}
            labelValue={editing ? labelValue : ""}
            placeholder={placeholder}
            onSelect={handleSelect}
            onStartEdit={handleStartEdit}
            onCancel={handleCancel}
            onCommit={handleCommit}
            onBlur={handleBlur}
            onLabelChange={handleLabelChange}
          />
        );
      })}

      <ConnectorDraft />
    </svg>
  );
}
