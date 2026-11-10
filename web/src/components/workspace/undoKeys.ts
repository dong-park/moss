import { useWorkspace } from "@/state/workspace";
import { redoBoard, undoBoard } from "@/state/ydoc/undo";

/**
 * cmd-z-undo n3 — cmd+z 키 경로 판정.
 *
 * 키 경로는 셋이다(스펙 경계 조건 「키」).
 * - 펜 모드면 펜 획 기록이 받는다.
 * - 편집 중(editingId 또는 펼친 메모 창)이거나 입력칸에 포커스가 있으면 그쪽 기본 동작이 받는다.
 * - 그 밖에는 보드 기록이 받는다.
 * cmd와 ctrl을 둘 다 받고, 다시 실행은 shift를 더한다. 한글 입력기가 켜져 있으면
 * e.key가 'ㅋ'이라 e.code 'KeyZ'도 받는다.
 */

export type UndoKeyAction = "pen-undo" | "pen-redo" | "canvas-undo" | "canvas-redo" | "none";

export type UndoKeyEvent = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey">;

export type UndoKeyState = {
  penMode: boolean;
  editingId: string | null;
  expandedCardId: string | null;
  /** input·textarea·contenteditable에 포커스가 있는가. */
  typing: boolean;
};

export function isUndoZKey(e: Pick<KeyboardEvent, "key" | "code">): boolean {
  return e.key === "z" || e.key === "Z" || e.code === "KeyZ";
}

/** 키 이벤트 모양과 상태로 cmd+z가 어디로 갈지 정한다. 순수 함수. */
export function decideUndoKey(e: UndoKeyEvent, state: UndoKeyState): UndoKeyAction {
  if (!(e.metaKey || e.ctrlKey)) return "none";
  if (!isUndoZKey(e)) return "none";
  if (state.penMode) return e.shiftKey ? "pen-redo" : "pen-undo";
  if (state.editingId !== null || state.expandedCardId !== null || state.typing) return "none";
  return e.shiftKey ? "canvas-redo" : "canvas-undo";
}

/** 포커스가 입력칸인가 — Canvas의 isTyping과 같은 규칙. */
export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el || typeof (el as HTMLElement).matches !== "function") return false;
  return (el as HTMLElement).matches("input, textarea, [contenteditable='true']");
}

/** 판정 결과를 실행한다. 실행한 것이 있으면 true. */
export function applyUndoKey(action: UndoKeyAction): boolean {
  const ws = useWorkspace.getState();
  switch (action) {
    case "pen-undo":
      ws.penUndo();
      return true;
    case "pen-redo":
      ws.penRedo();
      return true;
    case "canvas-undo":
      undoBoard();
      return true;
    case "canvas-redo":
      redoBoard();
      return true;
    default:
      return false;
  }
}

/**
 * 캔버스 keydown 처리기의 cmd+z 부분. 지금 스토어 상태와 포커스로 판정해 실행한다.
 * 처리했으면 true — 호출자가 preventDefault하고 다른 키 처리를 건너뛴다.
 */
export function handleUndoKeyDown(e: UndoKeyEvent): boolean {
  const ws = useWorkspace.getState();
  const action = decideUndoKey(e, {
    penMode: ws.penMode,
    editingId: ws.editingId,
    expandedCardId: ws.expandedCardId,
    typing: typeof document !== "undefined" && isTypingTarget(document.activeElement),
  });
  return applyUndoKey(action);
}
