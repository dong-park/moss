"use client";

import { useCollab } from "@/state/collab";
import { RemoteCursors } from "./RemoteCursors";
import { RemoteSelection } from "./RemoteSelection";
import { DragGhost } from "./DragGhost";

/**
 * FEAT-collab-auth n7 (P1) — 원격 표시 레이어를 각자 useCollab을 구독하는
 * 래퍼로 분리한다. Canvas가 participants를 구독하면 awareness가 바뀔 때마다
 * 카드 가상화까지 통째로 다시 계산된다. 구독 지점을 여기로 내려 Canvas 본체는
 * 원격 변동에 리렌더되지 않는다.
 */
export function RemoteCursorsLayer() {
  const participants = useCollab((s) => s.participants);
  return <RemoteCursors participants={participants} />;
}

export function RemoteSelectionLayer() {
  const participants = useCollab((s) => s.participants);
  return <RemoteSelection participants={participants} />;
}

export function DragGhostLayer() {
  const participants = useCollab((s) => s.participants);
  return <DragGhost participants={participants} />;
}
