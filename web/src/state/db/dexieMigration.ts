import type { Board, Connection, MossDB, Note } from "./schema";
import {
  openBoardDoc,
  putBoard,
  putConnection,
  putNote,
  readConnections,
  readNotes,
  transactLocal,
  type BoardDocHandle,
} from "@/state/ydoc";
import { SYSTEM_BOARD_ID } from "@/state/workspace";

/**
 * FEAT-collab-auth n2 — Dexie v6 보드를 Yjs 문서로 자동 이전.
 *
 * 원본(Dexie notes·boards·connections)은 지우지 않는다. 보드 단위로 격리해
 * 한 보드가 실패해도 나머지는 변환된다. 멱등이라 재실행해도 같은 결과가 나온다.
 *
 * 문서 키는 `boardId ?? SYSTEM_BOARD_ID`. 시스템 보드는 Dexie 행이 없지만
 * 사용자의 기본 메모가 boardId=null로 살아 있어 `moss-board-system` 문서로 옮긴다.
 */
export const MIGRATION_VERSION = 1;
export const MIGRATION_FAILURE_LIMIT = 3;
/**
 * 보드 하나의 open·쓰기·영속 검증 전체 상한. y-indexeddb가 blocked(다른 탭
 * 업그레이드)·quota에서 whenLoaded를 영원히 pending으로 두면 이 시간 뒤 그 보드를
 * 실패로 기록한다. (타임아웃돼도 배경 작업은 끝나면 스스로 정리한다.)
 */
export const MIGRATION_DOC_TIMEOUT_MS = 10_000;
/** 동시에 여는 보드 수. 보드별 실패 격리는 유지한다. */
export const MIGRATION_CONCURRENCY = 4;

export type OpenBoardDocFn = (boardId: string) => BoardDocHandle;

export interface MigrationOutcome {
  /** 이번 실행에서 새로 변환한 문서 키 */
  migrated: string[];
  /** 이번 실행에서 실패한 문서 키 (실패 횟수 증가) */
  failed: string[];
  /** 이번 실행에서 이미 변환돼 건너뛴 문서 키 */
  alreadyDone: string[];
  /** 실패 한도에 닿아 건너뛴 문서 키 */
  atFailureLimit: string[];
}

export interface MigrationResult extends MigrationOutcome {
  /** 이전 완료한 문서 키 전체 (기존 + 이번 성공) */
  migratedDocs: string[];
  /** 문서 키 → 연속 실패 횟수 */
  migrationFailures: Record<string, number>;
  /** 이전을 끝낸 스키마 버전. 미완(전체 타임아웃)이면 직전 값 유지 → 다음 부팅에 재시도. */
  dexieMigrationVersion: number;
}

export interface MigrationTimeouts {
  perDocMs?: number;
  concurrency?: number;
}

/** 실패 한도에 닿아 자동 재시도를 멈춘 문서 키 — UI가 내보내기 버튼을 띄운다. */
export function boardsAtFailureLimit(
  migrationFailures: Record<string, number> | undefined,
  limit: number = MIGRATION_FAILURE_LIMIT,
): string[] {
  if (!migrationFailures) return [];
  return Object.entries(migrationFailures)
    .filter(([, count]) => count >= limit)
    .map(([boardId]) => boardId);
}

/**
 * 다중 탭이 동시에 첫 실행하면 같은 보드를 두 번 옮길 수 있다(멱등이라 값은
 * 같지만 낭비다). Web Locks가 있으면 그 안에서만 실행해 두 번째 탭이 첫 탭의
 * version 기록을 보고 즉시 반환하게 한다. 없으면 그대로 실행한다.
 */
export async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks as
    | { request<R>(name: string, cb: () => Promise<R>): Promise<R> }
    | undefined;
  if (!locks) return fn();
  return locks.request("moss-dexie-migration", fn);
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function warnInvalidRow(table: string, field: string): void {
  console.warn(`[moss] ${table} 행 스키마가 올바르지 않아 이전에서 건너뜁니다: ${field}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

/** run이 끝나면 false, ms를 넘기면 true. 전체 타임아웃 판정용. */
function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort();
}

/**
 * 모든 보드를 Yjs 문서로 이전한다. 상태 기록은 호출자가 settings에 저장한다
 * (이 함수는 DB를 읽기만 한다). 실패는 문서 단위로 격리한다.
 *
 * settings.dexieMigrationVersion이 `MIGRATION_VERSION`과 같고 재시도할 실패가
 * 남아 있지 않으면 Dexie를 스캔하지 않고 즉시 반환한다. 쓰기 경로가 바뀌면
 * `MIGRATION_VERSION`을 올려 전체를 다시 이전한다.
 */
export async function migrateDexieBoards(
  db: MossDB,
  openDoc: OpenBoardDocFn = openBoardDoc,
  limit: number = MIGRATION_FAILURE_LIMIT,
  timeouts: MigrationTimeouts = {},
): Promise<MigrationResult> {
  const perDocMs = timeouts.perDocMs ?? MIGRATION_DOC_TIMEOUT_MS;
  const concurrency = Math.max(1, timeouts.concurrency ?? MIGRATION_CONCURRENCY);

  const settings = await db.settings.get("singleton");
  const storedVersion = settings?.dexieMigrationVersion ?? 0;
  // 작업 5: 버전을 올리면 이전 완료 기록을 버리고 전부 다시 이전한다. 이전 스키마로
  // 쓰인 문서가 그대로 남아 새 경로와 어긋나는 것을 막는다.
  const migrated =
    storedVersion === MIGRATION_VERSION
      ? new Set(settings?.migratedDocs ?? [])
      : new Set<string>();
  const failures: Record<string, number> = { ...(settings?.migrationFailures ?? {}) };

  const retryable = Object.values(failures).some((count) => count < limit);
  if (storedVersion === MIGRATION_VERSION && !retryable) {
    const alreadyDone = sortedStrings(migrated);
    return {
      migrated: [],
      failed: [],
      alreadyDone,
      atFailureLimit: boardsAtFailureLimit(failures, limit).sort(),
      migratedDocs: alreadyDone,
      migrationFailures: { ...failures },
      dexieMigrationVersion: storedVersion,
    };
  }

  const outcome: MigrationOutcome = {
    migrated: [],
    failed: [],
    alreadyDone: [],
    atFailureLimit: [],
  };

  const [boardsRaw, notesRaw, connectionsRaw] = await Promise.all([
    db.boards.toArray(),
    db.notes.toArray(),
    db.connections.toArray(),
  ]);

  // 신뢰 경계 — Dexie 행을 그대로 문서에 흘리지 않는다. id는 문자열이어야 하고
  // boardId는 문자열|null이어야 한다. 시스템 보드 id를 가진 Dexie board 행은
  // 문서 meta로 덮어써질 수 있으므로 거부한다(시스템 보드는 문서에만 존재).
  const boardById = new Map<string, Board>();
  for (const raw of boardsRaw as unknown[]) {
    const row = raw as Partial<Board>;
    if (typeof row?.id !== "string") {
      warnInvalidRow("boards", "id");
      continue;
    }
    if (row.id === SYSTEM_BOARD_ID) {
      console.warn(`[moss] 시스템 보드 id의 Dexie board 행을 이전에서 거부합니다: ${row.id}`);
      continue;
    }
    boardById.set(row.id, raw as Board);
  }

  const notes: Note[] = [];
  for (const raw of notesRaw as unknown[]) {
    const row = raw as Partial<Note>;
    if (typeof row?.id !== "string") {
      warnInvalidRow("notes", "id");
      continue;
    }
    if (row.boardId !== null && typeof row.boardId !== "string") {
      warnInvalidRow("notes", "boardId");
      continue;
    }
    // 작업 5: 전처리를 영속 검증(isRenderableNote)과 같은 조건으로 맞춘다. kind/x/y가
    // 빠진 행은 문서에 넣어도 읽기에서 걸러져 "영속 실패"로 오분류됐다.
    if (
      typeof row.kind !== "string" ||
      typeof row.x !== "number" ||
      typeof row.y !== "number"
    ) {
      warnInvalidRow("notes", "kind/x/y");
      continue;
    }
    notes.push(raw as Note);
  }

  const connections: Connection[] = [];
  for (const raw of connectionsRaw as unknown[]) {
    const row = raw as Partial<Connection>;
    if (
      typeof row?.id !== "string" ||
      typeof row.sourceNoteId !== "string" ||
      typeof row.targetNoteId !== "string"
    ) {
      warnInvalidRow("connections", "id");
      continue;
    }
    connections.push(raw as Connection);
  }

  const noteBoard = new Map<string, string>();
  const notesByDoc = new Map<string, Note[]>();
  for (const note of notes) {
    const key = note.boardId ?? SYSTEM_BOARD_ID;
    noteBoard.set(note.id, key);
    pushTo(notesByDoc, key, note);
  }

  // 작업 7: 연결선 소유 문서는 source 메모의 보드 하나다. 반대쪽 보드는 조회 시
  // id로 모은다 — 양쪽에 쓰면 비공개 보드의 메모 id·토폴로지가 공유 문서로 샌다.
  const connectionsByDoc = new Map<string, Connection[]>();
  for (const connection of connections) {
    const sourceKey = noteBoard.get(connection.sourceNoteId) ?? SYSTEM_BOARD_ID;
    pushTo(connectionsByDoc, sourceKey, connection);
  }

  const docKeys = [
    ...new Set<string>([
      ...boardById.keys(),
      ...notesByDoc.keys(),
      ...connectionsByDoc.keys(),
    ]),
  ].sort();

  async function processDoc(key: string): Promise<void> {
    if (migrated.has(key)) {
      outcome.alreadyDone.push(key);
      return;
    }
    if ((failures[key] ?? 0) >= limit) {
      outcome.atFailureLimit.push(key);
      return;
    }
    try {
      await migrateBoardDoc(
        key,
        boardById.get(key),
        notesByDoc.get(key) ?? [],
        connectionsByDoc.get(key) ?? [],
        openDoc,
        perDocMs,
      );
      migrated.add(key);
      delete failures[key];
      outcome.migrated.push(key);
    } catch (err) {
      failures[key] = (failures[key] ?? 0) + 1;
      outcome.failed.push(key);
      console.warn(`[moss] 보드 이전 실패: ${key} (${failures[key]}/${limit})`, err);
    }
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < docKeys.length) {
      const key = docKeys[cursor++];
      await processDoc(key);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, docKeys.length) }, () => worker()),
  );

  return {
    ...outcome,
    migrated: sortedStrings(outcome.migrated),
    failed: sortedStrings(outcome.failed),
    alreadyDone: sortedStrings(outcome.alreadyDone),
    atFailureLimit: sortedStrings(outcome.atFailureLimit),
    migratedDocs: sortedStrings(migrated),
    // 반환하는 failures는 복사본 — 호출자가 저장하는 사이 더 이상 변하지 않는다(작업 4).
    migrationFailures: { ...failures },
    dexieMigrationVersion: MIGRATION_VERSION,
  };
}

/** 타임아웃돼도 핸들은 반드시 정리한다 — whenLoaded가 영원히 pending이어도
 * destroy를 별도 상한으로 감싸 IndexedDB 연결·Y.Doc 누수를 막는다(작업 4·n2 P1). */
async function destroyHandle(handle: BoardDocHandle, ms: number): Promise<void> {
  try {
    await withTimeout(handle.destroy(), ms, `문서 정리 타임아웃: ${handle.boardId}`);
  } catch {
    /* ponytail: destroy조차 매달리면 여기서 더 할 수 없다 — 참조는 버려진다. */
  }
}

/**
 * 보드 하나를 문서로 옮긴다. 모든 쓰기를 한 트랜잭션으로 묶어(메모 1,000장도
 * y-indexeddb에 한 번만 저장) 드라이버 부하를 줄인다. n1 쓰기 함수는 같은
 * origin의 중첩 트랜잭션을 허용한다.
 *
 * 쓴 뒤 닫고 다시 열어 원본 메모 id가 모두 문서에 있는지(부분집합) 확인한다 —
 * 저장이 조용히 실패한 경우(quota 등)를 여기서 잡는다. 개수가 아니라 id 부분집합이라
 * 문서에 원본보다 많은 항목이 있어도(다른 탭이 쓴 경우 등) 실패로 보지 않는다.
 */
async function migrateBoardDoc(
  boardId: string,
  board: Board | undefined,
  notes: Note[],
  connections: Connection[],
  openDoc: OpenBoardDocFn,
  perDocMs: number,
): Promise<void> {
  const handle = openDoc(boardId);
  try {
    await withTimeout(
      handle.whenLoaded,
      perDocMs,
      `보드 이전 타임아웃: ${boardId}`,
    );
    transactLocal(handle.doc, () => {
      if (board) putBoard(handle.doc, board);
      for (const note of notes) putNote(handle.doc, note);
      for (const connection of connections) {
        putConnection(handle.doc, connection);
      }
    });
  } finally {
    await destroyHandle(handle, perDocMs);
  }

  const verify = openDoc(boardId);
  try {
    await withTimeout(
      verify.whenLoaded,
      perDocMs,
      `보드 이전 검증 타임아웃: ${boardId}`,
    );
    const persistedNotes = new Set(readNotes(verify.doc).map((n) => n.id));
    for (const note of notes) {
      if (!persistedNotes.has(note.id)) {
        throw new Error(`보드 이전 영속 검증 실패: ${boardId} 메모 ${note.id} 누락`);
      }
    }
    const persistedConnections = new Set(readConnections(verify.doc).map((c) => c.id));
    for (const connection of connections) {
      if (!persistedConnections.has(connection.id)) {
        throw new Error(`보드 이전 영속 검증 실패: ${boardId} 연결선 ${connection.id} 누락`);
      }
    }
  } finally {
    await destroyHandle(verify, perDocMs);
  }
}
