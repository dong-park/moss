import { assignColorsByJoinOrder } from "@/state/presence/colors";
import type {
  CursorPos,
  DraggingState,
  PresenceParticipant,
  SelectionRect,
} from "@/state/presence/types";

/** 원격 awareness가 실을 수 있는 참여자·선택·이름의 상한 (P1 DoS 방어). */
export const MAX_PARTICIPANTS = 64;
export const MAX_SELECTION = 64;
export const MAX_NAME_LENGTH = 80;

/**
 * FEAT-collab-auth n7 작업 2·3 — Awareness 상태 → 렌더용 참여자 목록.
 *
 * 색은 각 클라이언트가 같은 규칙(정렬된 clientId 순서)으로 계산하므로
 * 모든 화면이 같은 사람에게 같은 색을 준다. Awareness에 실린 색은 신뢰하지
 * 않는다 — 원격 값은 스푸핑될 수 있고, 순서가 바뀌면 화면마다 색이 갈린다.
 *
 * 색은 자기 자신을 포함한 전체 정렬 목록에 배정한 뒤 self만 빼고 돌려준다.
 * self를 빼고 배정하면 viewer마다 뒤 순번이 한 칸씩 밀려 같은 사람의 색이
 * 화면마다 달라진다(P1).
 */
export function participantsFromStates(
  states: Map<number, Record<string, unknown>>,
  excludeClientId?: number,
): PresenceParticipant[] {
  const all = [...states.entries()]
    .filter(([, state]) => readUser(state) !== null)
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_PARTICIPANTS);

  const colors = assignColorsByJoinOrder(all.map(([clientId]) => clientId));

  return all
    .filter(([clientId]) => clientId !== excludeClientId)
    .map(([clientId, state]) => {
      const participant: PresenceParticipant = {
        clientId,
        user: { ...readUser(state)!, color: colors.get(clientId)! },
      };
      const cursor = readCursor(state.cursor);
      if (cursor) participant.cursor = cursor;
      const selection = readSelection(state.selection);
      if (selection.length > 0) participant.selection = selection;
      const dragging = readDragging(state.dragging);
      if (dragging) participant.dragging = dragging;
      return participant;
    });
}

function readUser(state: Record<string, unknown>): { name: string } | null {
  const user = state.user;
  if (!isRecord(user)) return null;
  if (typeof user.name !== "string" || user.name.length === 0) return null;
  return { name: user.name.slice(0, MAX_NAME_LENGTH) };
}

function readCursor(value: unknown): CursorPos | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== "number" || typeof value.y !== "number") return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function readSelection(value: unknown): SelectionRect[] {
  if (!Array.isArray(value)) return [];
  const rects: SelectionRect[] = [];
  for (const item of value) {
    const rect = readSelectionRect(item);
    if (rect) rects.push(rect);
  }
  return rects.slice(0, MAX_SELECTION);
}

function readSelectionRect(value: unknown): SelectionRect | null {
  if (!isRecord(value)) return null;
  const { noteId, x, y, width, height, rotation } = value;
  if (typeof noteId !== "string") return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  return {
    noteId,
    x,
    y,
    width,
    height,
    rotation: isFiniteNumber(rotation) ? rotation : 0,
  };
}

function readDragging(value: unknown): DraggingState | null {
  if (!isRecord(value)) return null;
  const { noteId, x, y, rotation } = value;
  if (typeof noteId !== "string") return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return { noteId, x, y, rotation: isFiniteNumber(rotation) ? rotation : 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
