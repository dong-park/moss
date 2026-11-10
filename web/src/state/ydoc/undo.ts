import * as Y from "yjs";
import { connectionsMap, notesMap } from "./model";
import { LOCAL_ORIGIN, UNTRACKED_ORIGIN } from "./origin";

/**
 * cmd-z-undo n3 — 보드별 캔버스 기록 장치.
 *
 * 보드 문서마다 Y.UndoManager 하나. 범위는 notes·connections 맵이고 기록하는
 * origin은 LOCAL_ORIGIN뿐이다(UNTRACKED_ORIGIN 쓰기는 기록 밖). 기록은 보드를
 * 불러온 뒤(정리·시드 뒤) 만들고 보드를 떠나면 버린다(D6 B).
 *
 * 단계 규칙(스펙 기술 결정 「단계」, :193):
 * - 가장 바깥 동작의 진입점이 openUndoStep으로 stopCapturing을 불러 새 단계를 연다.
 *   묶음 깊이가 0보다 크면 열지 않는다. 기록 안 하는 origin이면 열지 않는다.
 * - 묶음(편집·펜·크기 조절·드래그)은 깊이를 센다. 가장 바깥 시작에서만 stopCapturing +
 *   captureTimeout 무한, 가장 바깥 끝에서만 captureTimeout 500 + stopCapturing.
 *   yjs는 captureTimeout이 무한이어도 stopCapturing으로 단계를 가른다(UndoManager.js:239).
 * - 묶음 시작은 그 UndoManager 세대를 담은 토큰을 돌려준다. 끝은 토큰 세대가 지금
 *   세대와 같고 아직 안 끝낸 토큰일 때만 깊이를 내린다. 깊이는 0 밑으로 안 간다.
 * - 기록은 100단계까지. 넘치면 가장 오래된 단계를 버린다(D1 A).
 */

export const UNDO_CAPTURE_TIMEOUT_MS = 500;
export const UNDO_MAX_STEPS = 100;

type StackItem = Y.UndoManager["undoStack"][number];

/** 묶음 소유자 토큰. 묶음 끝에 그대로 넘긴다. */
export type UndoGroupToken = {
  readonly gen: number;
  readonly id: number;
};

type BoardUndo = {
  key: string;
  um: Y.UndoManager;
  /** UndoManager마다 다른 세대(전역에서 하나씩 늘리는 수). */
  gen: number;
  /** 묶음 깊이 — UndoManager마다 따로 둔다. */
  depth: number;
  /** 아직 안 끝낸 토큰 id. */
  openTokens: Set<number>;
};

/** 보드 키 → 기록. 보통 활성 보드 하나만 있다. */
const boards = new Map<string, BoardUndo>();
let activeKey: string | null = null;
let genSeq = 0;
let tokenSeq = 0;
/** 이 탭이 만든 UndoManager — 탭 사이 방송이 그 쓰기를 알아보는 데 쓴다. */
const managers = new WeakSet<object>();

/** 보드 기록이 없을 때 돌려주는 토큰 — 끝내도 아무 일도 없다. */
const INERT_GEN = -1;

function active(): BoardUndo | null {
  return activeKey === null ? null : (boards.get(activeKey) ?? null);
}

/* ── 단계 hook (n5·n6이 채운다) ─────────────────────────────── */

export type UndoDirection = "undo" | "redo";

export type UndoStepHooks = {
  /** 되돌리기·다시 실행이 바뀐 것 없는 단계를 건너뛰었을 때. 건너뛴 단계는 기록에서 사라진다. */
  onSkipped?: (items: StackItem[], direction: UndoDirection) => void;
  /** 되돌리기·다시 실행이 단계 하나를 적용했을 때. */
  onApplied?: (item: StackItem, direction: UndoDirection) => void;
  /** 100단계 상한으로 가장 오래된 단계를 버렸을 때. */
  onDropped?: (items: StackItem[]) => void;
};

const hookSet = new Set<UndoStepHooks>();

/** 단계 hook 등록. 해제 함수를 돌려준다. */
export function registerUndoStepHooks(hooks: UndoStepHooks): () => void {
  hookSet.add(hooks);
  return () => {
    hookSet.delete(hooks);
  };
}

function callHooks(fn: (h: UndoStepHooks) => void): void {
  for (const h of [...hookSet]) {
    try {
      fn(h);
    } catch {
      /* hook 오류가 기록 장치를 멈추지 않게 한다 */
    }
  }
}

/* ── 수명 ─────────────────────────────────────────────────────── */

/**
 * 보드 문서의 기록을 새로 만들고 활성으로 둔다. 같은 키의 옛 기록은 버린다.
 * 보드 불러오기·정리·시드가 끝난 뒤에 부른다.
 */
export function createBoardUndo(key: string, doc: Y.Doc): Y.UndoManager {
  disposeBoardUndo(key);
  const um = new Y.UndoManager([notesMap(doc), connectionsMap(doc)], {
    captureTimeout: UNDO_CAPTURE_TIMEOUT_MS,
    trackedOrigins: new Set<unknown>([LOCAL_ORIGIN]),
  });
  managers.add(um);
  const entry: BoardUndo = { key, um, gen: ++genSeq, depth: 0, openTokens: new Set() };
  um.on("stack-item-added", (event) => {
    if (event.type !== "undo") return;
    const over = um.undoStack.length - UNDO_MAX_STEPS;
    if (over <= 0) return;
    const dropped = um.undoStack.splice(0, over);
    callHooks((h) => h.onDropped?.(dropped));
  });
  boards.set(key, entry);
  activeKey = key;
  return um;
}

/**
 * 보드 기록을 버린다. 묶음 깊이와 captureTimeout을 처음 값으로 되돌리고 destroy한다.
 * 세대가 사라지므로 이 기록에서 받은 토큰은 이후 모두 무시된다.
 */
export function disposeBoardUndo(key: string): void {
  const entry = boards.get(key);
  if (!entry) return;
  boards.delete(key);
  if (activeKey === key) activeKey = null;
  entry.depth = 0;
  entry.openTokens.clear();
  entry.um.captureTimeout = UNDO_CAPTURE_TIMEOUT_MS;
  try {
    entry.um.clear();
    entry.um.destroy();
  } catch {
    /* 문서가 먼저 닫혔으면 UndoManager도 이미 destroy됐다 */
  }
}

/** 지금 활성 보드의 기록을 버린다(보드를 떠날 때). */
export function disposeActiveBoardUndo(): void {
  if (activeKey !== null) disposeBoardUndo(activeKey);
}

/** 테스트·재개 경계용 — 모든 기록을 버린다. */
export function disposeAllBoardUndo(): void {
  for (const key of [...boards.keys()]) disposeBoardUndo(key);
  activeKey = null;
}

/** 지금 보드의 UndoManager. 기록이 없으면 null. n4~n6 시험이 undoStack 길이를 재고 clear한다. */
export function getBoardUndoManager(): Y.UndoManager | null {
  return active()?.um ?? null;
}

/** 지금 보드 기록의 보드 키. */
export function getBoardUndoKey(): string | null {
  return active()?.key ?? null;
}

/** 지금 보드의 묶음 깊이와 captureTimeout. 기록이 없으면 null. */
export function getBoardUndoGroupState(): { depth: number; captureTimeout: number } | null {
  const entry = active();
  if (!entry) return null;
  return { depth: entry.depth, captureTimeout: entry.um.captureTimeout };
}

/** 이 탭의 보드 UndoManager인가 — 탭 사이 방송이 되돌리기 쓰기를 고른다. */
export function isBoardUndoManager(origin: unknown): boolean {
  return typeof origin === "object" && origin !== null && managers.has(origin);
}

/* ── 단계 ─────────────────────────────────────────────────────── */

/**
 * 기록하는 동작의 진입점에서 부른다 — 새 단계를 연다(stopCapturing).
 * 묶음 안(깊이 > 0)이거나 기록 안 하는 origin이면 아무것도 안 한다.
 */
export function openUndoStep(origin: unknown = LOCAL_ORIGIN): void {
  if (origin === UNTRACKED_ORIGIN) return;
  const entry = active();
  if (!entry || entry.depth > 0) return;
  entry.um.stopCapturing();
}

/** 묶음 열기·닫기 옵션. quiet면 깊이와 captureTimeout만 바꾸고 단계를 가르지 않는다(stopCapturing 없음). */
export type UndoGroupOptions = { quiet?: boolean };

/**
 * 묶음 시작. 소유자 토큰을 돌려준다. 가장 바깥 묶음만 단계를 열고 captureTimeout을 무한으로 둔다.
 * quiet: 기록 안 하는 동작(브리지 등)이 바꾼 상태로 여는 묶음 — 사용자 단계를 끊지 않는다.
 */
export function beginUndoGroup(opts?: UndoGroupOptions): UndoGroupToken {
  const entry = active();
  const token: UndoGroupToken = { gen: entry ? entry.gen : INERT_GEN, id: ++tokenSeq };
  if (!entry) return token;
  if (entry.depth === 0) {
    if (!opts?.quiet) entry.um.stopCapturing();
    entry.um.captureTimeout = Number.POSITIVE_INFINITY;
  }
  entry.depth += 1;
  entry.openTokens.add(token.id);
  return token;
}

/**
 * 묶음 끝. 토큰 세대가 지금 보드 기록 세대와 같고 아직 안 끝낸 토큰일 때만 깊이를 내린다.
 * 가장 바깥 묶음이 끝나면 captureTimeout을 500으로 되돌리고 단계를 닫는다. quiet면 단계는 닫지 않는다.
 */
export function endUndoGroup(
  token: UndoGroupToken | null | undefined,
  opts?: UndoGroupOptions,
): void {
  if (!token) return;
  const entry = active();
  if (!entry || token.gen !== entry.gen) return;
  if (!entry.openTokens.delete(token.id)) return;
  entry.depth = Math.max(0, entry.depth - 1);
  if (entry.depth === 0) {
    entry.um.captureTimeout = UNDO_CAPTURE_TIMEOUT_MS;
    if (!opts?.quiet) entry.um.stopCapturing();
  }
}

/* ── 되돌리기·다시 실행 ───────────────────────────────────────── */

export type UndoResult = {
  /** 문서를 바꾼 단계가 있었는가. */
  applied: boolean;
  /** 바뀐 것이 없어 건너뛴 단계. 기록에서 사라졌다. */
  skipped: StackItem[];
};

function runStack(direction: UndoDirection): UndoResult {
  const entry = active();
  if (!entry) return { applied: false, skipped: [] };
  const { um } = entry;
  const from = direction === "undo" ? um.undoStack : um.redoStack;
  if (from.length === 0) return { applied: false, skipped: [] };
  // yjs는 바뀐 것 없는 단계를 건너뛰며 계속 꺼내고 건너뛴 단계엔 이벤트가 없다
  // (UndoManager.js popStackItem). 전후 길이를 비교해 빠진 단계를 모두 찾는다.
  const fromBefore = [...from];
  const toBefore = (direction === "undo" ? um.redoStack : um.undoStack).length;
  const item = direction === "undo" ? um.undo() : um.redo();
  const fromAfter = (direction === "undo" ? um.undoStack : um.redoStack).length;
  const toAfter = (direction === "undo" ? um.redoStack : um.undoStack).length;
  const popped = fromBefore.slice(fromAfter);
  const applied = item !== null && toAfter > toBefore;
  // popStackItem은 끝에서부터 꺼낸다. 적용된 단계는 마지막으로 꺼낸 것(popped[0])이다.
  const skipped = applied ? popped.slice(1).reverse() : popped.reverse();
  if (skipped.length > 0) callHooks((h) => h.onSkipped?.(skipped, direction));
  if (applied && item) callHooks((h) => h.onApplied?.(item, direction));
  return { applied, skipped };
}

/** 지금 보드의 마지막 단계를 되돌린다. */
export function undoBoard(): UndoResult {
  return runStack("undo");
}

/** 지금 보드의 마지막으로 되돌린 단계를 다시 실행한다. */
export function redoBoard(): UndoResult {
  return runStack("redo");
}
