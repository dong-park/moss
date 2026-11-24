/**
 * cmd-z-undo n5 — 되돌리기·다시 실행·원격 반영이 휴지통을 맞추는 Dexie 쪽 일.
 *
 * 메모는 보드, 휴지통, 기록 보관 가운데 한 곳에만 있다(스펙 「상태 모델」).
 * - 판정은 실행할 때의 보드 문서로 한다. 미러는 0.3초 늦어 판정에 쓰지 않는다.
 * - 휴지통 행 내용도 지우기 직전 보드 문서 값이다(웨이브 4 리뷰 W4-1·W4-3). 단계 meta의 내용은
 *   문서 값이 없을 때만 쓴다.
 * - 미러 행을 지우기 전에 그 메모의 이미 시작된 미러 쓰기를 기다린다(W4-5, cardPersist).
 * - 휴지통 쓰기는 한 줄로 차례를 지킨다. 빠르게 연달아 누른 cmd+z가 남긴 쓰기가 서로
 *   엇갈려 미러 행을 되살리거나 휴지통 행을 빠뜨리지 않게 한다(실패 모드 5).
 */
import type * as Y from "yjs";
import { connectionMirrorSettled, persistSettled } from "./cardPersist";
import { getDB, type Connection, type Note } from "./db/schema";
import { readConnection, readNote } from "./ydoc/model";

let chain: Promise<void> = Promise.resolve();

/** 휴지통 쓰기를 차례에 넣는다. 앞 쓰기가 끝난 뒤 시작한다. */
export function enqueueTrashJob(job: () => Promise<void>): Promise<void> {
  // 실패한 쓰기가 줄을 멈추지 않게 한다(테스트 teardown·새로고침 경계에서 DB가 닫힌다).
  const run = chain.then(job).catch(() => undefined);
  chain = run;
  return run;
}

/** 결과와 오류를 돌려주는 휴지통 쓰기(휴지통 살리기). 차례는 enqueueTrashJob과 같다. */
export function runTrashJob<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 이미 시작한 휴지통 쓰기를 차례에 넣는다 — 뒤에 오는 쓰기가 이 쓰기를 기다린다. */
export function trackTrashWrite<T>(p: Promise<T>): Promise<T> {
  const prev = chain;
  chain = Promise.all([prev, p.catch(() => undefined)]).then(() => undefined);
  return p;
}

/** 지금까지 넣은 휴지통 쓰기가 모두 끝나면 풀린다. */
export function trashIdle(): Promise<void> {
  return chain;
}

type TrashDB = ReturnType<typeof getDB>;

/** 휴지통 행을 넣고 미러 행을 지운다. 내용은 부른 쪽이 보드 문서에서 읽은 값이다. */
async function putTrashRow(db: TrashDB, note: Note): Promise<void> {
  const board = note.boardId === null ? undefined : await db.boards.get(note.boardId);
  await db.trash.put({ id: note.id, note, boardName: board?.name ?? null, deletedAt: Date.now() });
  await db.embeddings.delete(note.id);
  await db.notes.delete(note.id);
}

/**
 * 문서에서 사라진 연결선마다 판정한다(웨이브 4 리뷰 W4-2). 한 끝 메모가 휴지통에 있으면
 * 연결선 휴지통에 넣는다. 두 끝 모두 보드나 기록 보관이면 미러 행만 지운다. 값은 부른 쪽이
 * 지우기 직전 보드 문서에서 읽은 것이다. 그새 문서에 다시 나타난 연결선은 건너뛴다.
 */
async function parkVanished(db: TrashDB, doc: Y.Doc, connections: Connection[]): Promise<void> {
  for (const c of connections) {
    if (readConnection(doc, c.id)) continue;
    const endTrashed =
      !!(await db.trash.get(c.sourceNoteId)) || !!(await db.trash.get(c.targetNoteId));
    if (endTrashed) await db.trashConnections.put(c);
    await db.connections.delete(c.id);
  }
}

const TRASH_TABLES = (db: TrashDB) => [
  db.notes,
  db.connections,
  db.embeddings,
  db.trash,
  db.trashConnections,
  db.boards,
];

/** 되돌리기·다시 실행 한 번이 휴지통에 할 일. 값은 모두 적용 직전 보드 문서에서 읽었다. */
export type UndoTrashPlan = {
  /** 휴지통에 넣을 메모. 문서 값이 없을 때만 단계 meta의 내용이다. */
  put: Note[];
  /** 기록 보관할 메모 id — 미러 행만 지운다. */
  archive: string[];
  /** 이 적용이 문서에서 지운 연결선 전부. */
  connections: Connection[];
};

/**
 * 되돌리기·다시 실행의 휴지통 맞추기. 메모를 먼저 휴지통에 넣거나 기록 보관하고, 그 뒤
 * 사라진 연결선을 판정한다 — 같은 적용에서 휴지통에 들어간 끝 메모도 센다.
 * 그 메모들의 이미 시작된 미러 쓰기가 끝난 뒤 지운다(W4-5). 메모가 문서에 다시 있으면 건너뛴다.
 * 기록 보관은 휴지통에 넣지 않고 첨부 파일도 남긴다(storage.removeNote는 첨부를 지워서 쓰지 않는다).
 */
export async function applyUndoTrash(doc: Y.Doc, plan: UndoTrashPlan): Promise<void> {
  await persistSettled([...plan.put.map((n) => n.id), ...plan.archive]);
  await connectionMirrorSettled();
  const db = getDB();
  await db.transaction("rw", TRASH_TABLES(db), async () => {
    for (const note of plan.put) {
      if (!readNote(doc, note.id)) await putTrashRow(db, note);
    }
    for (const id of plan.archive) {
      if (readNote(doc, id)) continue;
      await db.embeddings.delete(id);
      await db.notes.delete(id);
    }
    await parkVanished(db, doc, plan.connections);
  });
}

/**
 * 기록 보관 — 미러 행만 지운다. 메모가 문서에 다시 있으면 안 지운다. 같은 기기 다른 탭의
 * 삭제를 받은 탭이 자기 늦은 미러 쓰기를 치울 때도 쓴다(휴지통은 안 만진다).
 */
export function archiveMirror(doc: Y.Doc, id: string): Promise<void> {
  return applyUndoTrash(doc, { put: [], archive: [id], connections: [] });
}

/** 캔버스 remove·removeSelected가 지운 메모 하나 — 지우기 직전 보드 문서 값. */
export type DocTrashEntry = { note: Note; connections: Connection[] };

/**
 * 캔버스 삭제의 휴지통 넣기(W4-1). 메모와 문서에서 함께 지운 연결선을 지우기 직전 문서 값으로
 * 넣는다 — 미러 행이 아직 없어도 넣는다(미러는 0.3초 늦다). 미러에만 있는 닿은 연결선(다른 보드
 * 문서 소유)은 지금처럼 옮긴다. 이미 시작된 미러 쓰기가 끝난 뒤 지운다. 메모가 그새 문서에
 * 다시 나타났으면 그 메모는 건너뛴다.
 */
export async function trashNotesFromDoc(doc: Y.Doc, entries: DocTrashEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await persistSettled(entries.map((e) => e.note.id));
  await connectionMirrorSettled();
  const db = getDB();
  await db.transaction("rw", TRASH_TABLES(db), async () => {
    for (const { note, connections } of entries) {
      if (readNote(doc, note.id)) continue;
      await putTrashRow(db, note);
      const mirrored = await db.connections
        .where("sourceNoteId")
        .equals(note.id)
        .or("targetNoteId")
        .equals(note.id)
        .toArray();
      const parked = new Map<string, Connection>();
      for (const c of [...mirrored, ...connections]) {
        if (!readConnection(doc, c.id)) parked.set(c.id, c);
      }
      await db.trashConnections.bulkPut([...parked.values()]);
      await db.connections.bulkDelete([...parked.keys()]);
    }
  });
}

/**
 * 원격 삭제가 함께 지운 연결선을 판정한다. 메모는 storage.trashNote가 미러에서 이미 넣었다.
 * 미러에 아직 없던 연결선도 지우기 직전 문서 값으로 연결선 휴지통에 들어간다.
 */
export async function parkVanishedConnections(doc: Y.Doc, connections: Connection[]): Promise<void> {
  if (connections.length === 0) return;
  await connectionMirrorSettled();
  const db = getDB();
  await db.transaction("rw", [db.trash, db.trashConnections, db.connections], () =>
    parkVanished(db, doc, connections),
  );
}

/**
 * 보드 문서에 있는 메모의 휴지통 행을 뺀다. 닿은 연결선 휴지통 행 가운데 보드 문서
 * connections에 있는 것은 빼서 미러 connections에 두고, 문서에 없는 것은 남긴다.
 * 되돌리기·다시 실행 뒤와 원격에서 다시 나타난 메모에 같은 규칙을 쓴다.
 */
export async function untrashOnBoard(doc: Y.Doc, ids: string[]): Promise<void> {
  const present = ids.filter((id) => readNote(doc, id));
  if (present.length === 0) return;
  const db = getDB();
  await db.transaction("rw", [db.trash, db.trashConnections, db.connections], async () => {
    await db.trash.bulkDelete(present);
    const parked = await db.trashConnections
      .where("sourceNoteId")
      .anyOf(present)
      .or("targetNoteId")
      .anyOf(present)
      .toArray();
    const back = parked.flatMap((c) => {
      const live = readConnection(doc, c.id);
      return live ? [live] : [];
    });
    await db.connections.bulkPut(back);
    await db.trashConnections.bulkDelete(back.map((c) => c.id));
  });
}

/** 보드 문서에 다시 나타난 연결선의 휴지통 행을 빼서 미러 connections에 둔다. */
export async function untrashConnections(doc: Y.Doc, ids: string[]): Promise<void> {
  const back = ids.flatMap((id) => {
    const live = readConnection(doc, id);
    return live ? [live] : [];
  });
  if (back.length === 0) return;
  const db = getDB();
  await db.transaction("rw", [db.trashConnections, db.connections], async () => {
    const parked = (await db.trashConnections.bulkGet(back.map((c) => c.id))).filter(
      (c): c is Connection => !!c,
    );
    if (parked.length === 0) return;
    const parkedIds = new Set(parked.map((c) => c.id));
    await db.connections.bulkPut(back.filter((c) => parkedIds.has(c.id)));
    await db.trashConnections.bulkDelete([...parkedIds]);
  });
}
