/**
 * FEAT-collab-auth n7 — Awareness 상태 모양 (D4, n7 작업 2).
 *
 * 커서·선택·드래그는 Y.Doc에 쓰지 않고 Awareness로만 흘린다. 놓을 때
 * `commitMove`가 문서에 한 번 쓴다(AC-7). 이 타입은 provider 연결과 무관한
 * 순수 데이터 모양이고, 렌더 컴포넌트가 이 배열 하나만 받는다.
 */

/** 한 참여자의 표시 정체. 색은 접속 순서로 배정된 시스템 색. */
export interface AwarenessUser {
  name: string;
  /** 시스템 색 8개 중 하나 (CSS 색 문자열). */
  color: string;
}

/** 캔버스 world 좌표계의 포인터 위치. */
export interface CursorPos {
  x: number;
  y: number;
}

/**
 * 원격 선택 테두리를 그리려면 카드 기하가 필요하다 — 선택된 카드의
 * world 좌표·크기·회전을 함께 싣는다. 문서를 다시 읽지 않고 렌더하려는
 * 목적이라 위치는 Awareness에 둔다(D4: 좌표는 Awareness).
 */
export interface SelectionRect {
  noteId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** 끄는 중인 카드의 실시간 위치. 놓으면 문서에 한 번 쓴다. */
export interface DraggingState {
  noteId: string;
  x: number;
  y: number;
  rotation: number;
}

/** Awareness에 실리는 참여자 하나. clientId는 Yjs clientID. */
export interface PresenceParticipant {
  clientId: number;
  user: AwarenessUser;
  cursor?: CursorPos;
  selection?: SelectionRect[];
  dragging?: DraggingState;
}
